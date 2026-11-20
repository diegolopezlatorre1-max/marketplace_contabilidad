import Decimal from 'decimal.js';

/**
 * Instancia de Decimal exclusiva del dominio contable.
 * Regla única de redondeo: HALF_UP (ver docs/adr/0002-dinero-decimal.md).
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DecimalValue = InstanceType<typeof D>;

export const DECIMALES_MONEDA = 2;
export const DECIMALES_PORCENTAJE = 4;
