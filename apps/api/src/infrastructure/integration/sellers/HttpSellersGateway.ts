import type { Logger } from 'pino';
import type { SellersGateway } from '../../../application/ports/out/SellersGateway';

/** Respuesta mínima que el adaptador necesita del transporte HTTP (permite simularlo en pruebas). */
export interface RespuestaVendedores {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type ConsultarHttp = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal },
) => Promise<RespuestaVendedores>;

export interface OpcionesHttpSellersGateway {
  /** URL base de la API de Vendedores, sin barra final (VENDEDORES_URL). */
  url: string;
  /** Se envía en la cabecera x-api-key si Vendedores la exige (VENDEDORES_API_KEY). */
  apiKey?: string | undefined;
  timeoutMs: number;
}

/**
 * Adaptador HTTP del módulo de Vendedores (INTEGRATION_MODE=http). Supuesto por confirmar con
 * ese equipo (docs/adaptador-consumidor.md, sección 4):
 *
 *   GET {VENDEDORES_URL}/vendedores?ids=V-1,V-2  →  200 [ { "id": "V-1", "nombre": "..." } ]
 *
 * Los nombres solo adornan las consultas contables: si Vendedores falla, tarda o responde algo
 * inesperado, se registra en el log y se devuelve un mapa vacío (la consulta muestra el id).
 */
export class HttpSellersGateway implements SellersGateway {
  constructor(
    private readonly opciones: OpcionesHttpSellersGateway,
    private readonly logger: Logger,
    private readonly consultar: ConsultarHttp = (url, init) => fetch(url, init),
  ) {}

  async obtenerNombres(vendedorIds: string[]): Promise<Map<string, string>> {
    const nombres = new Map<string, string>();
    const ids = [...new Set(vendedorIds)].filter(Boolean);
    if (!ids.length) return nombres;

    const base = this.opciones.url.replace(/\/+$/, '');
    const url = `${base}/vendedores?ids=${ids.map(encodeURIComponent).join(',')}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.opciones.apiKey) headers['x-api-key'] = this.opciones.apiKey;

    try {
      const respuesta = await this.consultar(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.opciones.timeoutMs),
      });
      if (!respuesta.ok) {
        this.logger.warn({ status: respuesta.status }, 'Vendedores respondió con error');
        return nombres;
      }
      const cuerpo = await respuesta.json();
      if (!Array.isArray(cuerpo)) {
        this.logger.warn('Respuesta de Vendedores con formato inesperado');
        return nombres;
      }
      const pedidos = new Set(ids);
      for (const item of cuerpo) {
        const { id, nombre } = (item ?? {}) as { id?: unknown; nombre?: unknown };
        if (typeof id === 'string' && typeof nombre === 'string' && pedidos.has(id)) {
          nombres.set(id, nombre);
        }
      }
    } catch (err) {
      this.logger.warn({ err }, 'No se pudo consultar el módulo de Vendedores');
    }
    return nombres;
  }
}
