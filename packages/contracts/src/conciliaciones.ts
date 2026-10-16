import { z } from 'zod';
import { fechaContableSchema } from './comisiones';
import { montoPositivoSchema } from './common';

export const ESTADOS_CONCILIACION = ['CONCILIADA', 'PENDIENTE'] as const;
export type EstadoConciliacion = (typeof ESTADOS_CONCILIACION)[number];

export const ESTADOS_PAGO_RECIBIDO = ['SIN_CONCILIAR', 'CONCILIADO', 'PENDIENTE'] as const;
export type EstadoPagoRecibido = (typeof ESTADOS_PAGO_RECIBIDO)[number];

/** POST /conciliaciones: relaciona un pago recibido con una o varias órdenes. */
export const conciliarPagoSchema = z.object({
  pagoId: z.string().uuid(),
  ordenes: z
    .array(
      z.object({
        numeroOrden: z.string().min(1).max(64),
        /** Si falta, se aplica el saldo pendiente de la orden. */
        valorAplicado: montoPositivoSchema.optional(),
      }),
    )
    .min(1)
    .refine((o) => new Set(o.map((x) => x.numeroOrden)).size === o.length, {
      message: 'Cada orden debe aparecer una sola vez',
    }),
});
export type ConciliarPagoRequest = z.infer<typeof conciliarPagoSchema>;

/** GET /pagos-recibidos?estado=&desde=&hasta= */
export const listarPagosRecibidosQuerySchema = z.object({
  estado: z.enum(ESTADOS_PAGO_RECIBIDO).optional(),
  desde: fechaContableSchema.optional(),
  hasta: fechaContableSchema.optional(),
});

/** GET /conciliaciones?estado=&desde=&hasta= (fechas del pago). */
export const listarConciliacionesQuerySchema = z.object({
  estado: z.enum(ESTADOS_CONCILIACION).optional(),
  desde: fechaContableSchema.optional(),
  hasta: fechaContableSchema.optional(),
});

export interface PagoRecibidoDto {
  id: string;
  referenciaPasarela: string;
  fecha: string;
  fechaContable: string;
  valor: string;
  origen: 'API' | 'CSV' | 'MANUAL';
  ordenesInformadas: string[];
  estado: EstadoPagoRecibido;
  conciliacionId: string | null;
  diferencia: string | null;
}

export interface ConciliacionDto {
  id: string;
  pagoId: string;
  referenciaPasarela: string;
  fechaPago: string;
  valorPago: string;
  valorAplicado: string;
  /** valorPago - valorAplicado (negativo: el pago no alcanza). */
  diferencia: string;
  estado: EstadoConciliacion;
  usuario: string;
  fecha: string;
  detalles: Array<{ numeroOrden: string; valorOrden: string; valorAplicado: string }>;
}

/** Respuesta de POST /eventos/pago-recibido. */
export interface PagoRecibidoProcesadoResponse {
  eventId: string;
  resultado: 'PROCESADO' | 'YA_PROCESADO';
  detalle?: string;
  pagoId?: string;
  estado?: EstadoPagoRecibido;
}

/** Respuesta de POST /pagos-recibidos/importar (CSV). */
export interface ImportacionPagosResponse {
  filas: Array<{
    linea: number;
    referencia?: string;
    resultado: 'IMPORTADO' | 'DUPLICADO' | 'ERROR';
    estado?: EstadoPagoRecibido;
    detalle?: string;
  }>;
  importados: number;
  duplicados: number;
  errores: number;
}
