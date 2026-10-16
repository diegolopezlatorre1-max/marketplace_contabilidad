export type EstadoCuenta = 'PENDIENTE' | 'PAGADO';

export interface ComisionFila {
  /** Identificador de la venta (abre su detalle). */
  id: string;
  numeroOrden: string;
  vendedorId: string;
  vendedorNombre: string;
  periodo: string;
  fecha: string;
  valorBruto: string;
  porcentajeAplicado: string;
  comision: string;
  valorNeto: string;
}

/** HU-CON-02: detalle de una venta con su desglose. */
export interface VentaDetalle extends ComisionFila {
  estadoOrigen: string;
  /** Instante en que contabilidad la registró (ISO 8601). */
  registradoEn: string;
}

/** HU-CON-03: saldo total de un vendedor (de un periodo o de todos). */
export interface SaldoVendedorFila {
  vendedorId: string;
  vendedorNombre: string;
  cuentas: number;
  totalNeto: string;
  valorPagado: string;
  saldoPendiente: string;
}

export interface CuentaPorPagarFila {
  vendedorId: string;
  vendedorNombre: string;
  periodo: string;
  totalNeto: string;
  valorPagado: string;
  saldoPendiente: string;
  estado: EstadoCuenta;
}

/** HU-CON-09: porcentaje que rige desde una fecha (AAAA-MM-DD). */
export interface VigenciaPorcentaje {
  desde: string;
  porcentaje: string;
  /** Último día de vigencia (inclusive); null = vigente. Lo informa la API. */
  hasta?: string | null;
  /** Usuario que la configuró (lo informa la API). */
  creadoPor?: string;
}

/** HU-CON-01: venta confirmada que se registra. */
export interface NuevaVenta {
  numeroOrden: string;
  vendedorId: string;
  vendedorNombre: string;
  fecha: string;
  valorBruto: string;
}

/** Pago mínimo (HU-CON-10 lo amplía) para ver el paso a PAGADO. */
export interface NuevoPago {
  vendedorId: string;
  periodo: string;
  valor: string;
}
