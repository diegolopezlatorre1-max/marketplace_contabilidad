import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SobreEventoContabilidad } from '@contabilidad/contracts';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import {
  OutboxRelay,
  type EnviarHttp,
  type OpcionesRelay,
} from '../../src/infrastructure/messaging/OutboxRelay';
import { PgOutboxPublisher } from '../../src/infrastructure/persistence/postgres/PgOutboxPublisher';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const PAGO = 'contabilidad.pago-vendedor.registrado';
const URL_NOTIFICACIONES = 'https://notificaciones.example/eventos';

const opciones = (o: Partial<OpcionesRelay> = {}): OpcionesRelay => ({
  destinos: { [PAGO]: URL_NOTIFICACIONES },
  lote: 20,
  maxIntentos: 3,
  timeoutMs: 1_000,
  backoffBaseMs: 60_000,
  backoffMaxMs: 3_600_000,
  ...o,
});

/** Destino HTTP simulado: guarda cada envío y responde con el estado indicado. */
function destino(respuesta: number | (() => Promise<number>) = 200) {
  const envios: Array<{
    url: string;
    headers: Record<string, string>;
    sobre: SobreEventoContabilidad;
  }> = [];
  const enviar: EnviarHttp = async (url, init) => {
    envios.push({ url, headers: init.headers, sobre: JSON.parse(init.body) });
    return { status: typeof respuesta === 'number' ? respuesta : await respuesta() };
  };
  return { envios, enviar };
}

async function publicar(tipo: string, payload: Record<string, unknown>, correlationId?: string) {
  await new PgOutboxPublisher(testPool()).publicar({
    tipo,
    payload,
    ...(correlationId ? { correlationId } : {}),
  });
}

async function filas() {
  const { rows } = await testPool().query<{
    tipo: string;
    estado: string;
    intentos: number;
    ultimo_error: string | null;
    publicado: boolean;
    reintento_futuro: boolean;
  }>(
    `SELECT tipo, estado, intentos, ultimo_error, publicado_en IS NOT NULL AS publicado,
            siguiente_intento > now() AS reintento_futuro
       FROM contabilidad.outbox ORDER BY id`,
  );
  return rows;
}

beforeEach(limpiarTablas);

describe('OutboxRelay contra PostgreSQL (GUIA_EQUIPO_6, sección 7)', () => {
  it('entrega el evento con su sobre y cabeceras, y lo marca PUBLICADO', async () => {
    await publicar(PAGO, { pagoId: 'p-1', vendedorId: 'V-1', valor: '10.00' }, 'corr-77');
    const d = destino(202);
    const relay = new OutboxRelay(
      testPool(),
      opciones({ apiKey: 'clave-notif' }),
      logger,
      d.enviar,
    );

    expect(await relay.procesarLote()).toEqual({ publicados: 1, reintentos: 0, deadLetter: 0 });
    expect(d.envios).toHaveLength(1);
    const [envio] = d.envios;
    expect(envio?.url).toBe(URL_NOTIFICACIONES);
    expect(envio?.sobre).toMatchObject({
      tipo: PAGO,
      modulo: 'contabilidad',
      correlationId: 'corr-77',
      payload: { pagoId: 'p-1', vendedorId: 'V-1', valor: '10.00' },
    });
    expect(envio?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-event-id': envio?.sobre.eventId,
      'x-event-type': PAGO,
      'x-correlation-id': 'corr-77',
      'x-api-key': 'clave-notif',
    });
    expect(await filas()).toEqual([
      expect.objectContaining({ estado: 'PUBLICADO', intentos: 1, publicado: true }),
    ]);
    // Ya publicado: no se vuelve a enviar.
    await relay.procesarLote();
    expect(d.envios).toHaveLength(1);
  });

  it('reintenta con backoff y pasa a DEAD_LETTER al agotar los intentos', async () => {
    await publicar(PAGO, { pagoId: 'p-1' });
    const d = destino(503);
    const relay = new OutboxRelay(testPool(), opciones(), logger, d.enviar);

    expect(await relay.procesarLote()).toEqual({ publicados: 0, reintentos: 1, deadLetter: 0 });
    expect(await filas()).toEqual([
      expect.objectContaining({
        estado: 'PENDIENTE',
        intentos: 1,
        ultimo_error: 'HTTP 503',
        reintento_futuro: true,
      }),
    ]);
    // El reintento aún no vence: no se envía otra vez.
    await relay.procesarLote();
    expect(d.envios).toHaveLength(1);

    // Simula que pasó la espera dos veces.
    for (let i = 0; i < 2; i++) {
      await testPool().query(`UPDATE contabilidad.outbox SET siguiente_intento = now()`);
      await relay.procesarLote();
    }
    expect(d.envios).toHaveLength(3);
    expect(await filas()).toEqual([
      expect.objectContaining({ estado: 'DEAD_LETTER', intentos: 3, publicado: false }),
    ]);
    // Un dead-letter no se reintenta solo.
    await testPool().query(`UPDATE contabilidad.outbox SET siguiente_intento = now()`);
    await relay.procesarLote();
    expect(d.envios).toHaveLength(3);
  });

  it('un error de red o un timeout también se reintenta, con el motivo guardado', async () => {
    await publicar(PAGO, { pagoId: 'p-1' });
    const caido: EnviarHttp = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    await new OutboxRelay(testPool(), opciones(), logger, caido).procesarLote();
    expect((await filas())[0]?.ultimo_error).toBe('connect ECONNREFUSED');

    await testPool().query(`UPDATE contabilidad.outbox SET siguiente_intento = now()`);
    const lento: EnviarHttp = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    await new OutboxRelay(testPool(), opciones({ timeoutMs: 50 }), logger, lento).procesarLote();
    expect(await filas()).toEqual([
      expect.objectContaining({ intentos: 2, ultimo_error: 'Sin respuesta en 50 ms' }),
    ]);
  });

  it('solo toma los tipos con destino; "*" los cubre a todos', async () => {
    await publicar(PAGO, { pagoId: 'p-1' });
    await publicar('contabilidad.venta.registrada', { ventaId: 'v-1' });
    const d = destino();
    await new OutboxRelay(testPool(), opciones(), logger, d.enviar).procesarLote();
    expect(d.envios.map((e) => e.sobre.tipo)).toEqual([PAGO]);
    expect((await filas()).map((f) => f.estado)).toEqual(['PUBLICADO', 'PENDIENTE']);

    const todos = destino();
    await new OutboxRelay(
      testPool(),
      opciones({ destinos: { '*': 'https://bus.example/in' } }),
      logger,
      todos.enviar,
    ).procesarLote();
    expect(todos.envios.map((e) => [e.url, e.sobre.tipo])).toEqual([
      ['https://bus.example/in', 'contabilidad.venta.registrada'],
    ]);
  });

  it('dos relays simultáneos no envían el mismo evento (FOR UPDATE SKIP LOCKED)', async () => {
    for (let i = 0; i < 6; i++) await publicar(PAGO, { pagoId: `p-${i}` });
    // Envío lento para que los dos lotes se solapen.
    const d = destino(() => new Promise((r) => setTimeout(() => r(200), 30)));
    const a = new OutboxRelay(testPool(), opciones({ lote: 3 }), logger, d.enviar);
    const b = new OutboxRelay(testPool(), opciones({ lote: 3 }), logger, d.enviar);
    await Promise.all([a.procesarLote(), b.procesarLote()]);

    const ids = d.envios.map((e) => e.sobre.payload.pagoId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6);
  });

  it('sin destinos no toca el outbox', async () => {
    await publicar(PAGO, { pagoId: 'p-1' });
    const d = destino();
    const relay = new OutboxRelay(testPool(), opciones({ destinos: {} }), logger, d.enviar);
    expect(relay.habilitado).toBe(false);
    expect(await relay.procesarLote()).toEqual({ publicados: 0, reintentos: 0, deadLetter: 0 });
    expect(d.envios).toHaveLength(0);
  });

  it('GET /health informa los eventos pendientes y en dead-letter', async () => {
    await publicar(PAGO, { pagoId: 'p-1' });
    await publicar(PAGO, { pagoId: 'p-2' });
    await testPool().query(
      `UPDATE contabilidad.outbox SET estado = 'DEAD_LETTER'
        WHERE id = (SELECT min(id) FROM contabilidad.outbox)`,
    );
    const { router } = createContabilidadModule({
      config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
      pool: testPool(),
      logger,
    });
    const res = await request(createHttpApp({ router, logger, corsOrigins: [] })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.outbox).toEqual({ pendientes: 1, deadLetter: 1 });
  });
});
