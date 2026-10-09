import { z } from 'zod';
import { fechaIsoSchema, monedaSchema, montoPositivoSchema } from './common';

/**
 * Contratos de eventos entrantes, v1 (ver docs/fase0/contratos-integracion.md).
 * Eventos de Órdenes: v1 congelada el 2026-10-08, con los supuestos S-01..S-03.
 * pago.recibido: borrador; se cierra con el equipo de Pagos antes del Sprint 2.
 */

const baseEvento = {
  eventId: z.string().min(1).max(100),
  version: z.literal(1),
  ocurridoEn: fechaIsoSchema,
};

export const lineaOrdenSchema = z.object({
  vendedorId: z.string().min(1).max(64),
  valorBruto: montoPositivoSchema,
  categoriaId: z.string().max(64).optional(),
});

export const ordenConfirmadaSchema = z.object({
  ...baseEvento,
  tipo: z.literal('orden.confirmada'),
  numeroOrden: z.string().min(1).max(64),
  fecha: fechaIsoSchema,
  estado: z.string().min(1),
  moneda: monedaSchema,
  /** Una línea por vendedor: las órdenes multi-vendedor se liquidan por separado (H-12, D-05). */
  lineas: z
    .array(lineaOrdenSchema)
    .min(1)
    .refine((lineas) => new Set(lineas.map((l) => l.vendedorId)).size === lineas.length, {
      message: 'Cada vendedor debe aparecer una sola vez por orden',
    }),
});
export type OrdenConfirmadaEvent = z.infer<typeof ordenConfirmadaSchema>;

export const ordenCanceladaSchema = z.object({
  ...baseEvento,
  tipo: z.literal('orden.cancelada'),
  numeroOrden: z.string().min(1).max(64),
  fecha: fechaIsoSchema,
  motivo: z.string().min(1).max(500),
  lineas: z.array(z.object({ vendedorId: z.string().min(1).max(64) })).min(1),
});
export type OrdenCanceladaEvent = z.infer<typeof ordenCanceladaSchema>;

export const ordenDevueltaSchema = z.object({
  ...baseEvento,
  tipo: z.literal('orden.devuelta'),
  numeroOrden: z.string().min(1).max(64),
  fecha: fechaIsoSchema,
  motivo: z.string().min(1).max(500),
  lineas: z
    .array(z.object({ vendedorId: z.string().min(1).max(64), valorDevuelto: montoPositivoSchema }))
    .min(1),
});
export type OrdenDevueltaEvent = z.infer<typeof ordenDevueltaSchema>;

export const pagoRecibidoSchema = z.object({
  ...baseEvento,
  tipo: z.literal('pago.recibido'),
  referenciaPasarela: z.string().min(1).max(100),
  fecha: fechaIsoSchema,
  valor: montoPositivoSchema,
  moneda: monedaSchema,
  origen: z.enum(['API', 'CSV', 'MANUAL']),
  ordenes: z.array(z.string().min(1).max(64)).optional(),
});
export type PagoRecibidoEvent = z.infer<typeof pagoRecibidoSchema>;

/** Respuesta estándar de los endpoints /eventos/*. */
export interface EventoProcesadoResponse {
  eventId: string;
  resultado: 'PROCESADO' | 'YA_PROCESADO' | 'IGNORADO';
  detalle?: string;
}
