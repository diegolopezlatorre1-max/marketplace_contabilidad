import { z } from 'zod';
import { fechaContableSchema } from './comisiones';
import { montoPositivoSchema, paginacionQuerySchema } from './common';

export const TIPOS_AJUSTE = ['DEVOLUCION', 'CANCELACION'] as const;
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number];

/**
 * POST /ajustes (HU-CON-06, rol CONTADOR). La DEVOLUCION exige el valor devuelto (puede ser
 * parcial); la CANCELACION revierte todo lo no ajustado y no lleva valor.
 */
export const registrarAjusteSchema = z
  .object({
    ventaId: z.string().uuid('Identificador de venta inválido'),
    tipo: z.enum(TIPOS_AJUSTE),
    motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(500),
    valor: montoPositivoSchema.optional(),
    /** Día del ajuste (hora de Colombia); por defecto, hoy. */
    fecha: fechaContableSchema.optional(),
  })
  .refine((a) => a.tipo !== 'DEVOLUCION' || a.valor !== undefined, {
    message: 'La devolución requiere el valor devuelto',
    path: ['valor'],
  })
  .refine((a) => a.tipo !== 'CANCELACION' || a.valor === undefined, {
    message: 'La cancelación revierte todo el valor no ajustado: no envíe valor',
    path: ['valor'],
  });
export type RegistrarAjusteRequest = z.infer<typeof registrarAjusteSchema>;

/** GET /ajustes?ventaId=&vendedorId=&desde=&hasta=&page=&size= (fechas del ajuste, inclusive). */
export const listarAjustesQuerySchema = paginacionQuerySchema.extend({
  ventaId: z.string().uuid('Identificador de venta inválido').optional(),
  vendedorId: z.string().min(1).max(64).optional(),
  desde: fechaContableSchema.optional(),
  hasta: fechaContableSchema.optional(),
});
export type ListarAjustesQuery = z.infer<typeof listarAjustesQuerySchema>;

/** Ajuste registrado (HU-CON-06). Montos como string decimal. */
export interface AjusteDto {
  id: string;
  ventaId: string;
  numeroOrden: string;
  vendedorId: string;
  tipo: TipoAjuste;
  motivo: string;
  /** Instante del ajuste (ISO 8601). */
  fecha: string;
  /** Día contable del ajuste: el reporte de HU-CON-05 lo ubica por esta fecha. */
  fechaContable: string;
  /** Quincena del ajuste. */
  periodo: string;
  valor: string;
  /** % aplicado en la venta original. */
  porcentajeAplicado: string;
  comisionRevertida: string;
  netoRevertido: string;
  /** Parte del neto revertido que ya se había pagado al vendedor (saldo a favor, D-07). */
  saldoAFavor: string;
  origen: 'MANUAL' | 'EVENTO';
  registradoPor: string;
  registradoEn: string;
}
