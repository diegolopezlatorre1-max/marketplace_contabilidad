export type EstadoCuenta = 'PENDIENTE' | 'PAGADO';

export interface ComisionFila {
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
