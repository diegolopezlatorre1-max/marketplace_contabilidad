import type {
  ComisionFila,
  CuentaPorPagarFila,
  EstadoCuenta,
  NuevaVenta,
  NuevoPago,
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
  listarComisiones(periodo?: string): Promise<ComisionFila[]>;
  listarCuentasPorPagar(filtro: FiltroCuentas): Promise<CuentaPorPagarFila[]>;
  registrarPago(pago: NuevoPago): Promise<CuentaPorPagarFila>;
}
