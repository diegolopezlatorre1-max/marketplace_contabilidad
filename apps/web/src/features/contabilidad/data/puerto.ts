import type {
  AjusteFila,
  ComisionFila,
  CuentaPorPagarFila,
  EstadoCuenta,
  NuevaVenta,
  NuevoAjuste,
  NuevoPago,
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
  registrarPago(pago: NuevoPago): Promise<CuentaPorPagarFila>;
  /** HU-CON-06: ajustes de una venta, del más reciente al más antiguo. */
  listarAjustes(ventaId: string): Promise<AjusteFila[]>;
  registrarAjuste(ajuste: NuevoAjuste): Promise<AjusteFila>;
}
