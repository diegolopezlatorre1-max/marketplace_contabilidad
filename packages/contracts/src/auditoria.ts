import { z } from 'zod';
import { fechaContableSchema } from './comisiones';
import { paginacionQuerySchema } from './common';

/** Entidades cuyos comandos dejan registro en contabilidad.auditoria (D-13). */
export const ENTIDADES_AUDITADAS = [
  'configuracion_comision',
  'venta_contable',
  'pago_recibido',
  'conciliacion',
  'ajuste_contable',
  'pago_vendedor',
] as const;
export type EntidadAuditada = (typeof ENTIDADES_AUDITADAS)[number];

/**
 * GET /auditoria?entidad=&entidadId=&usuario=&desde=&hasta=&page=&size= (HU-CON-11, solo
 * ADMIN_FINANCIERO). desde / hasta son días en hora de Colombia, inclusive.
 */
export const listarAuditoriaQuerySchema = paginacionQuerySchema.extend({
  entidad: z.enum(ENTIDADES_AUDITADAS).optional(),
  entidadId: z.string().trim().min(1).max(100).optional(),
  usuario: z.string().trim().min(1).max(100).optional(),
  desde: fechaContableSchema.optional(),
  hasta: fechaContableSchema.optional(),
});
export type ListarAuditoriaQuery = z.infer<typeof listarAuditoriaQuerySchema>;

/** Un movimiento auditado: quién hizo qué, cuándo, y los valores antes y después. */
export interface RegistroAuditoriaDto {
  id: number;
  entidad: string;
  entidadId: string;
  accion: string;
  usuario: string;
  /** Instante del cambio (ISO 8601). */
  fecha: string;
  valoresAnteriores: unknown;
  valoresNuevos: unknown;
  correlationId: string | null;
}
