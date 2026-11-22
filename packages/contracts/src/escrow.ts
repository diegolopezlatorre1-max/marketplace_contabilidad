import { z } from 'zod';
import { fechaIsoSchema } from './common';

/**
 * Escrow (GUIA_EQUIPO_6, sección 6): custodia del dinero de un pedido.
 *   POST /escrow/marcar-entrega/{pedido_id}  (Órdenes)  → retención de 72 h desde la entrega;
 *                                                         se libera sola al cumplirse el plazo.
 *   POST /escrow/bloquear/{pedido_id}        (servicio, módulo por definir) → PQR abierta.
 *   POST /escrow/desbloquear/{pedido_id}     (ADMIN)    → desbloqueo manual, con motivo.
 *   GET  /escrow/{pedido_id}                 (ADMIN)    → estado actual.
 * pedido_id es el número de orden de los eventos orden.confirmada.
 */
export const ESTADOS_ESCROW = ['SIN_ENTREGA', 'RETENIDO', 'LIBERADO', 'BLOQUEADO'] as const;
export type EstadoEscrow = (typeof ESTADOS_ESCROW)[number];

export const pedidoIdParamSchema = z.object({
  pedidoId: z.string().trim().min(1, 'El pedido es obligatorio').max(64),
});

/** Los cuerpos son opcionales: se acepta una petición sin cuerpo. */
const cuerpoOpcional = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((v) => v ?? {}, z.object(shape).strict());

export const marcarEntregaSchema = cuerpoOpcional({
  /** Instante de la entrega; por defecto, ahora. */
  fechaEntrega: fechaIsoSchema.optional(),
});
export type MarcarEntregaRequest = z.infer<typeof marcarEntregaSchema>;

export const bloquearEscrowSchema = cuerpoOpcional({
  /** Motivo o identificador de la PQR. */
  motivo: z.string().trim().max(500).optional(),
});
export type BloquearEscrowRequest = z.infer<typeof bloquearEscrowSchema>;

/** El ADMIN debe indicar por qué levanta el bloqueo (queda en la auditoría). */
export const desbloquearEscrowSchema = z
  .object({
    motivo: z.string().trim().min(1, 'El motivo del desbloqueo es obligatorio').max(500),
  })
  .strict();
export type DesbloquearEscrowRequest = z.infer<typeof desbloquearEscrowSchema>;

export interface EscrowPedidoDto {
  pedidoId: string;
  estado: EstadoEscrow;
  entregadoEn: string | null;
  /** entregadoEn + 72 h: desde aquí se le puede pagar al vendedor (si no está bloqueado). */
  liberableDesde: string | null;
  bloqueado: boolean;
  bloqueadoEn: string | null;
  motivoBloqueo: string | null;
  actualizadoEn: string;
}

/** Respuesta de las operaciones: ACTUALIZADO o SIN_CAMBIOS (reintento idempotente). */
export interface ResultadoEscrowDto extends EscrowPedidoDto {
  resultado: 'ACTUALIZADO' | 'SIN_CAMBIOS';
}
