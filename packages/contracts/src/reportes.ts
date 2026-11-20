import { z } from 'zod';
import { fechaContableSchema } from './comisiones';

/**
 * GET /reportes/ingresos?desde=&hasta=&vendedorId= (HU-CON-05).
 * Días contables en hora de Colombia (America/Bogota), inclusive.
 */
export const reporteIngresosQuerySchema = z.object({
  desde: fechaContableSchema,
  hasta: fechaContableSchema,
  vendedorId: z.string().min(1).max(64).optional(),
});
export type ReporteIngresosQuery = z.infer<typeof reporteIngresosQuerySchema>;

/** Sumas de un grupo de movimientos. Montos como string decimal. */
export interface TotalesMovimientosDto {
  cantidad: number;
  valorBruto: string;
  comision: string;
  valorNeto: string;
}

/** Ingresos de un día: ventas del día, ajustes con fecha de ese día y su diferencia. */
export interface ReporteIngresosDiaDto {
  /** Día contable (AAAA-MM-DD, hora de Colombia). */
  fecha: string;
  ventas: TotalesMovimientosDto;
  ajustes: TotalesMovimientosDto;
  totales: Omit<TotalesMovimientosDto, 'cantidad'>;
}

/**
 * Reporte de ingresos y comisiones por periodo (HU-CON-05). Las ventas se ubican por su
 * fecha contable y los ajustes (HU-CON-06) por la fecha del ajuste, no la de la venta.
 */
export interface ReporteIngresosDto {
  desde: string;
  hasta: string;
  vendedorId: string | null;
  ventas: TotalesMovimientosDto;
  /** Lo revertido por devoluciones y cancelaciones (valores positivos). */
  ajustes: TotalesMovimientosDto;
  /** Ventas menos ajustes. */
  totales: Omit<TotalesMovimientosDto, 'cantidad'>;
  /** bruto = comisión + neto en ventas, ajustes y totales. */
  control: { cuadra: boolean; detalle: string };
  /** Solo los días con movimientos, en orden ascendente. */
  porDia: ReporteIngresosDiaDto[];
}
