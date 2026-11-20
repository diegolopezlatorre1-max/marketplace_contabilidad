import { AlmacenContabilidad, crearApiEnMemoria } from './almacenEnMemoria';
import { PAGOS_SEMILLA, VENTAS_SEMILLA, VIGENCIAS_SEMILLA } from './mockData';
import type { ContabilidadApi } from './puerto';

export type { ContabilidadApi, FiltroCuentas } from './puerto';

/** Almacén con datos de partida, calculados con las mismas reglas que usará el backend. */
function crearAlmacenConSemilla(): AlmacenContabilidad {
  const almacen = new AlmacenContabilidad();
  VIGENCIAS_SEMILLA.forEach((v) => almacen.configurarPorcentaje(v));
  VENTAS_SEMILLA.forEach((v) => almacen.registrarVenta(v));
  PAGOS_SEMILLA.forEach((p) => almacen.registrarPago(p));
  return almacen;
}

/** Adaptador actual. En la Fase 5 se reemplaza por uno que llame a la API REST. */
export const contabilidadApiMock: ContabilidadApi = crearApiEnMemoria(
  crearAlmacenConSemilla(),
  200,
);
