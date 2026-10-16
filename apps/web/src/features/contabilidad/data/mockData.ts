import type { NuevaVenta, NuevoPago, VigenciaPorcentaje } from '../types';

/** Periodos del selector (el Paso 4 los tomará de los datos reales). */
export const PERIODOS: string[] = ['2026-10-Q1', '2026-10-Q2'];

export const VIGENCIAS_SEMILLA: VigenciaPorcentaje[] = [{ desde: '2026-01-01', porcentaje: '10' }];

export const VENTAS_SEMILLA: NuevaVenta[] = [
  {
    numeroOrden: 'ORD-1001',
    vendedorId: 'V-1',
    vendedorNombre: 'Tienda Aurora',
    fecha: '2026-10-03',
    valorBruto: '100000.00',
  },
  {
    numeroOrden: 'ORD-1002',
    vendedorId: 'V-1',
    vendedorNombre: 'Tienda Aurora',
    fecha: '2026-10-05',
    valorBruto: '50000.00',
  },
  {
    numeroOrden: 'ORD-1003',
    vendedorId: 'V-2',
    vendedorNombre: 'Casa Verde',
    fecha: '2026-10-07',
    valorBruto: '250000.00',
  },
  {
    numeroOrden: 'ORD-1004',
    vendedorId: 'V-2',
    vendedorNombre: 'Casa Verde',
    fecha: '2026-10-12',
    valorBruto: '80500.50',
  },
  {
    numeroOrden: 'ORD-1005',
    vendedorId: 'V-3',
    vendedorNombre: 'Moda Andina',
    fecha: '2026-10-18',
    valorBruto: '120000.00',
  },
];

export const PAGOS_SEMILLA: NuevoPago[] = [
  { vendedorId: 'V-2', periodo: '2026-10-Q1', valor: '297450.45' },
];
