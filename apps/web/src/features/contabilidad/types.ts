import type {
  EstadoVendedorDto,
  PagoVendedorDto,
  ReporteIngresosDto,
} from '@contabilidad/contracts';

/** PARCIAL (HU-CON-10): la cuenta tiene pagos, pero aún queda saldo. */
export type EstadoCuenta = 'PENDIENTE' | 'PARCIAL' | 'PAGADO';

/** HU-CON-05: reporte de ingresos (mismo formato que la API). */
export type ReporteIngresos = ReporteIngresosDto;

export interface FiltroReporte {
  /** Días contables en hora de Colombia (AAAA-MM-DD), inclusive. */
  desde: string;
  hasta: string;
  vendedorId?: string | undefined;
}

/** HU-CON-06: filtros del historial general de ajustes (fechas del ajuste, inclusive). */
export interface FiltroAjustes {
  desde?: string | undefined;
  hasta?: string | undefined;
  vendedorId?: string | undefined;
}

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

export type TipoAjuste = 'DEVOLUCION' | 'CANCELACION';

/** HU-CON-06: ajuste registrado sobre una venta (devolución o cancelación). */
export interface AjusteFila {
  id: string;
  tipo: TipoAjuste;
  motivo: string;
  /** Día del ajuste (AAAA-MM-DD). */
  fechaContable: string;
  valor: string;
  comisionRevertida: string;
  netoRevertido: string;
  /** Parte ya pagada al vendedor que queda a favor del marketplace. */
  saldoAFavor: string;
  origen: 'MANUAL' | 'EVENTO';
  registradoPor: string;
}

/** HU-CON-06: ajuste con la venta a la que pertenece (historial general). */
export interface AjusteDeVenta extends AjusteFila {
  ventaId: string;
  numeroOrden: string;
  vendedorId: string;
}

/** HU-CON-06: ajuste que registra el contador. La cancelación no lleva valor. */
export interface NuevoAjuste {
  ventaId: string;
  tipo: TipoAjuste;
  motivo: string;
  valor?: string;
  fecha?: string;
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

/**
 * HU-CON-10: pago que el contador hace a un vendedor. Se descuenta primero el saldo a favor del
 * marketplace y se aplica a las cuentas pendientes más antiguas (FIFO por periodo, D-06).
 */
export interface NuevoPago {
  vendedorId: string;
  /** Valor transferido. */
  valor: string;
  /** Referencia bancaria; única por vendedor. */
  referencia: string;
  soporte?: string;
  /** Día del pago (AAAA-MM-DD); por defecto, hoy. */
  fecha?: string;
}

/** HU-CON-10: pago registrado con las cuentas a las que se aplicó (mismo formato que la API). */
export type PagoVendedorFila = PagoVendedorDto;

/** HU-CON-07: estado financiero de un vendedor (mismo formato que la API). */
export type EstadoVendedor = EstadoVendedorDto;

/** HU-CON-10: filtros del historial de pagos (fechas del pago, inclusive). */
export interface FiltroPagos {
  vendedorId?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
}
