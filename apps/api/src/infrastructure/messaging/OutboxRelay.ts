import type pg from 'pg';
import type { Logger } from 'pino';
import type { SobreEventoContabilidad } from '@contabilidad/contracts';

/** Respuesta mínima que el relay necesita del transporte HTTP (permite simularlo en pruebas). */
export interface RespuestaHttp {
  status: number;
}
export type EnviarHttp = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<RespuestaHttp>;

export interface OpcionesRelay {
  /** Tipo de evento → URL. '*' es el destino de los tipos sin uno propio. */
  destinos: Record<string, string>;
  /** Se envía en la cabecera x-api-key si el destino la exige. */
  apiKey?: string | undefined;
  lote: number;
  maxIntentos: number;
  timeoutMs: number;
  /** Primer reintento; se duplica en cada intento hasta backoffMaxMs. */
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export interface ResultadoLote {
  publicados: number;
  reintentos: number;
  deadLetter: number;
}

interface FilaOutbox {
  id: string;
  event_id: string;
  tipo: string;
  payload: Record<string, unknown>;
  creado_en: Date;
  correlation_id: string | null;
  intentos: number;
}

/** Espera antes del reintento número `intento` (1, 2, 3...): base, 2·base, 4·base... con tope. */
export function esperaReintento(intento: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** Math.max(0, intento - 1), maxMs);
}

/**
 * "tipo=url,tipo2=url" → { tipo: url, tipo2: url }. '*' vale para cualquier tipo sin destino propio.
 * Lanza si una entrada no tiene el formato o la URL no es http(s).
 */
export function parseDestinosOutbox(valor: string | undefined): Record<string, string> {
  const destinos: Record<string, string> = {};
  for (const parte of (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const i = parte.indexOf('=');
    const tipo = i > 0 ? parte.slice(0, i).trim() : '';
    const url = i > 0 ? parte.slice(i + 1).trim() : '';
    if (!tipo || !/^https?:\/\/\S+$/.test(url)) {
      throw new Error('OUTBOX_DESTINOS inválido: use "tipo=https://..." separados por coma');
    }
    if (destinos[tipo]) throw new Error(`OUTBOX_DESTINOS repite el tipo "${tipo}"`);
    destinos[tipo] = url;
  }
  return destinos;
}

/**
 * Entrega los eventos del outbox (GUIA_EQUIPO_6, sección 7) por HTTP POST a los módulos suscritos.
 * - Toma lotes con FOR UPDATE SKIP LOCKED: varias instancias de la API no envían el mismo evento.
 * - 2xx → PUBLICADO. Otro estado, error de red o timeout → reintento con backoff exponencial.
 * - Tras `maxIntentos` fallos → DEAD_LETTER (queda para revisión; no se reintenta solo).
 * - Entrega "al menos una vez": el consumidor deduplica por eventId.
 * - Los tipos sin destino configurado quedan PENDIENTES hasta que se configure uno.
 */
export class OutboxRelay {
  private temporizador: NodeJS.Timeout | undefined;
  private enCurso: Promise<unknown> | undefined;

  constructor(
    private readonly pool: pg.Pool,
    private readonly opciones: OpcionesRelay,
    private readonly logger: Logger,
    private readonly enviar: EnviarHttp = (url, init) => fetch(url, init),
  ) {}

  get habilitado(): boolean {
    return Object.keys(this.opciones.destinos).length > 0;
  }

  /** Procesa un lote de eventos pendientes cuyo reintento ya venció. */
  async procesarLote(): Promise<ResultadoLote> {
    const resultado: ResultadoLote = { publicados: 0, reintentos: 0, deadLetter: 0 };
    if (!this.habilitado) return resultado;
    const { destinos } = this.opciones;
    const tipos = destinos['*'] ? null : Object.keys(destinos);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<FilaOutbox>(
        `SELECT id, event_id, tipo, payload, creado_en, correlation_id, intentos
           FROM contabilidad.outbox
          WHERE estado = 'PENDIENTE'
            AND siguiente_intento <= now()
            AND ($1::text[] IS NULL OR tipo = ANY($1::text[]))
          ORDER BY siguiente_intento, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [tipos, this.opciones.lote],
      );
      for (const fila of rows) {
        const url = (destinos[fila.tipo] ?? destinos['*']) as string;
        const error = await this.entregar(url, fila);
        const intentos = fila.intentos + 1;
        if (!error) {
          await client.query(
            `UPDATE contabilidad.outbox
                SET estado = 'PUBLICADO', publicado_en = now(), intentos = $2, ultimo_error = NULL
              WHERE id = $1`,
            [fila.id, intentos],
          );
          resultado.publicados++;
        } else if (intentos >= this.opciones.maxIntentos) {
          await client.query(
            `UPDATE contabilidad.outbox
                SET estado = 'DEAD_LETTER', intentos = $2, ultimo_error = $3
              WHERE id = $1`,
            [fila.id, intentos, error.slice(0, 1000)],
          );
          resultado.deadLetter++;
          this.logger.error(
            { eventId: fila.event_id, tipo: fila.tipo, intentos, error },
            'Evento enviado a dead-letter tras agotar los reintentos',
          );
        } else {
          const espera = esperaReintento(
            intentos,
            this.opciones.backoffBaseMs,
            this.opciones.backoffMaxMs,
          );
          await client.query(
            `UPDATE contabilidad.outbox
                SET intentos = $2, ultimo_error = $3,
                    siguiente_intento = now() + make_interval(secs => $4::double precision / 1000)
              WHERE id = $1`,
            [fila.id, intentos, error.slice(0, 1000), espera],
          );
          resultado.reintentos++;
          this.logger.warn(
            { eventId: fila.event_id, tipo: fila.tipo, intentos, esperaMs: espera, error },
            'No se pudo entregar el evento; se reintentará',
          );
        }
      }
      await client.query('COMMIT');
      return resultado;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Envía un evento. Devuelve el motivo del fallo, o undefined si el destino respondió 2xx. */
  private async entregar(url: string, fila: FilaOutbox): Promise<string | undefined> {
    const sobre: SobreEventoContabilidad = {
      eventId: fila.event_id,
      tipo: fila.tipo,
      modulo: 'contabilidad',
      ocurridoEn: fila.creado_en.toISOString(),
      correlationId: fila.correlation_id,
      payload: fila.payload,
    };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-event-id': fila.event_id,
      'x-event-type': fila.tipo,
      ...(fila.correlation_id ? { 'x-correlation-id': fila.correlation_id } : {}),
      ...(this.opciones.apiKey ? { 'x-api-key': this.opciones.apiKey } : {}),
    };
    try {
      const res = await this.enviar(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(sobre),
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
      return res.status >= 200 && res.status < 300 ? undefined : `HTTP ${res.status}`;
    } catch (e) {
      const err = e as Error;
      return err.name === 'TimeoutError'
        ? `Sin respuesta en ${this.opciones.timeoutMs} ms`
        : err.message || String(e);
    }
  }

  /** Procesa lotes cada `intervaloMs` sin solapar ejecuciones. */
  iniciar(intervaloMs: number): void {
    if (!this.habilitado || this.temporizador) return;
    this.temporizador = setInterval(() => {
      if (this.enCurso) return;
      this.enCurso = this.procesarLote()
        .catch((err: unknown) => this.logger.error({ err }, 'Error en el relay del outbox'))
        .finally(() => {
          this.enCurso = undefined;
        });
    }, intervaloMs);
    this.temporizador.unref();
    this.logger.info(
      { destinos: Object.keys(this.opciones.destinos), intervaloMs },
      'Relay del outbox iniciado',
    );
  }

  /** Cierre ordenado: deja de programar lotes y espera el que esté en curso. */
  async detener(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = undefined;
    await this.enCurso;
  }
}
