/**
 * Eventos que publica Contabilidad hacia el marketplace (outbox → OutboxRelay → HTTP POST).
 * Ver docs/fase0/contratos-integracion.md, sección "Contabilidad → Marketplace".
 */
export const EVENTOS_CONTABILIDAD = [
  'contabilidad.venta.registrada',
  'contabilidad.ajuste.registrado',
  'contabilidad.pago-vendedor.registrado',
  'contabilidad.conciliacion.cerrada',
  'contabilidad.escrow.actualizado',
] as const;
export type TipoEventoContabilidad = (typeof EVENTOS_CONTABILIDAD)[number];

/**
 * Sobre de todo evento entregado. El consumidor debe deduplicar por `eventId`: un reintento
 * (p. ej. tras un timeout) vuelve a enviar el mismo `eventId`.
 * Cabeceras HTTP: `content-type: application/json`, `x-event-id`, `x-event-type` y, si existe,
 * `x-correlation-id`.
 */
export interface SobreEventoContabilidad<P = Record<string, unknown>> {
  eventId: string;
  tipo: string;
  modulo: 'contabilidad';
  /** Instante en que se registró el evento (ISO 8601). */
  ocurridoEn: string;
  correlationId: string | null;
  payload: P;
}

/** Aplicación del pago a una quincena del vendedor. Montos como string decimal. */
export interface AplicacionPagoEvento {
  periodo: string;
  valorAplicado: string;
  saldoAnterior: string;
  saldoNuevo: string;
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
  /** Órdenes de esa quincena (sin las retenidas por escrow en el momento del pago). */
  ordenes: string[];
}

/**
 * `contabilidad.pago-vendedor.registrado` v2: el "pago acreditado" que Notificaciones (HU-NOT-05)
 * usa para avisar al vendedor. Identifica al vendedor, el monto y las órdenes asociadas.
 * v2 agrega `version`, `moneda`, `ordenes` y `cuentas[].ordenes`; los demás campos no cambian.
 */
export interface PagoVendedorRegistradoV2 {
  version: 2;
  pagoId: string;
  vendedorId: string;
  /** Instante del pago (ISO 8601). */
  fecha: string;
  /** Monto transferido al vendedor. */
  valor: string;
  moneda: 'COP';
  saldoAFavorAplicado: string;
  referencia: string;
  /** Órdenes asociadas al pago (unión de cuentas[].ordenes). */
  ordenes: string[];
  cuentas: AplicacionPagoEvento[];
}
