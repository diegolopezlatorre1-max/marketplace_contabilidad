import { z } from 'zod';
import { fechaContableSchema } from './comisiones';
import { paginacionQuerySchema, periodoSchema } from './common';

/** GET /ventas?desde=&hasta=&periodo=&vendedorId=&page=&size= (fechas contables AAAA-MM-DD, inclusive). */
export const listarVentasQuerySchema = paginacionQuerySchema.extend({
  desde: fechaContableSchema.optional(),
  hasta: fechaContableSchema.optional(),
  periodo: periodoSchema.optional(),
  vendedorId: z.string().min(1).max(64).optional(),
});
export type ListarVentasQuery = z.infer<typeof listarVentasQuerySchema>;

/** Venta registrada (HU-CON-01) con el desglose de su comisión (HU-CON-02). */
export interface VentaDto {
  id: string;
  numeroOrden: string;
  vendedorId: string;
  categoriaId: string | null;
  /** Instante de la orden (ISO 8601). */
  fecha: string;
  /** Día contable en hora de Colombia. */
  fechaContable: string;
  /** Quincena de liquidación, p. ej. "2026-10-Q1". */
  periodo: string;
  valorBruto: string;
  porcentajeAplicado: string | null;
  comision: string | null;
  valorNeto: string | null;
}
