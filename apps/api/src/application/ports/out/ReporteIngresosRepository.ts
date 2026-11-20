import type { FechaContable } from '../../../domain/shared';

export interface FiltroReporteIngresos {
  /** Días contables en hora de Colombia, inclusive. */
  desde: FechaContable;
  hasta: FechaContable;
  vendedorId?: string | undefined;
}

/** Sumas de un día. Montos como string decimal (se operan con Money en la consulta). */
export interface FilaDiaReporte {
  fecha: FechaContable;
  cantidad: number;
  valorBruto: string;
  comision: string;
  valorNeto: string;
}

/**
 * Puerto de lectura del reporte de ingresos (HU-CON-05; lo reutilizará HU-CON-08).
 * Agrupa por fecha_contable, que ya está en hora de Colombia: ventas por el día de la
 * venta y ajustes por el día del ajuste.
 */
export interface ReporteIngresosRepository {
  movimientosPorDia(
    filtro: FiltroReporteIngresos,
  ): Promise<{ ventas: FilaDiaReporte[]; ajustes: FilaDiaReporte[] }>;
}
