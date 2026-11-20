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

/** GET /ventas/{id} */
export const ventaIdParamSchema = z.object({
  id: z.string().uuid('Identificador de venta inválido'),
});

/** Venta registrada (HU-CON-01) con el desglose de su comisión (HU-CON-02). */
export interface VentaDto {
  id: string;
  numeroOrden: string;
  vendedorId: string;
  /** Nombre o razón social del módulo de Vendedores; el id si no se conoce. */
  vendedorNombre: string;
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

/** GET /ventas/{id}: detalle de la venta con el desglose bruto / % / comisión / neto (HU-CON-02). */
export interface VentaDetalleDto extends VentaDto {
  /** Estado de la orden al registrarse (siempre CONFIRMADA en el Sprint 1). */
  estadoOrigen: string;
  /** Instante en que contabilidad registró la venta (ISO 8601). */
  registradoEn: string;
}
