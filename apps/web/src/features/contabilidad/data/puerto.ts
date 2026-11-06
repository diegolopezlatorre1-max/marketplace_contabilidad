import type {
  AjusteDeVenta,
  AjusteFila,
  ComisionFila,
  CuentaPorPagarFila,
  EstadoCuenta,
  FiltroAjustes,
  FiltroPagos,
  FiltroReporte,
  NuevaVenta,
  NuevoAjuste,
  NuevoPago,
  PagoVendedorFila,
  ReporteIngresos,
  SaldoVendedorFila,
  VentaDetalle,
  VigenciaPorcentaje,
} from '../types';

export interface FiltroCuentas {
  periodo?: string | undefined;
  estado?: EstadoCuenta | undefined;
}

/** Puerto: las pantallas solo conocen esta interfaz. Hoy la cumple la memoria; mañana, la API. */
export interface ContabilidadApi {
  listarPeriodos(): Promise<string[]>;
  listarVigencias(): Promise<VigenciaPorcentaje[]>;
  configurarPorcentaje(vigencia: VigenciaPorcentaje): Promise<VigenciaPorcentaje>;
  registrarVenta(venta: NuevaVenta): Promise<ComisionFila>;
  listarComisiones(periodo?: string, vendedorId?: string): Promise<ComisionFila[]>;
  obtenerVenta(id: string): Promise<VentaDetalle>;
  listarCuentasPorPagar(filtro: FiltroCuentas): Promise<CuentaPorPagarFila[]>;
  resumirPorVendedor(periodo?: string): Promise<SaldoVendedorFila[]>;
  /** HU-CON-10: registra el pago a un vendedor y lo aplica FIFO a sus cuentas. */
  registrarPago(pago: NuevoPago): Promise<PagoVendedorFila>;
  /** HU-CON-10: pagos a vendedores, del más reciente al más antiguo. */
  listarPagos(filtro: FiltroPagos): Promise<PagoVendedorFila[]>;
  /** HU-CON-06: ajustes de una venta, del más reciente al más antiguo. */
  listarAjustes(ventaId: string): Promise<AjusteFila[]>;
  registrarAjuste(ajuste: NuevoAjuste): Promise<AjusteFila>;
  /** HU-CON-06: ajustes de todas las ventas, del más reciente al más antiguo. */
  buscarAjustes(filtro: FiltroAjustes): Promise<AjusteDeVenta[]>;
  /** HU-CON-05: ingresos y comisiones del rango; ajustes ubicados por su propia fecha. */
  obtenerReporte(filtro: FiltroReporte): Promise<ReporteIngresos>;
}
