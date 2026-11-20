import { z } from 'zod';

/**
 * Los montos viajan como string decimal con hasta 2 decimales ("100000.00")
 * para no perder precisión en JSON (ver docs/adr/0002-dinero-decimal.md).
 */
export const montoSchema = z
  .string()
  .regex(
    /^-?\d{1,16}(\.\d{1,2})?$/,
    'Monto inválido: use un string decimal con máximo 2 decimales',
  );

export const montoPositivoSchema = montoSchema.refine((v) => Number(v) > 0, {
  message: 'El monto debe ser mayor que cero',
});

export const fechaIsoSchema = z.string().datetime({ offset: true });

/** Quincena de liquidación (D-03): "2026-10-Q1" (días 1-15) o "2026-10-Q2" (16-fin de mes). */
export const periodoSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-Q[12]$/, 'Periodo inválido: use AAAA-MM-Q1 o AAAA-MM-Q2');

export const monedaSchema = z.literal('COP');

export const ROLES = ['CONTADOR', 'ADMIN_FINANCIERO', 'SISTEMA'] as const;
export const rolSchema = z.enum(ROLES);
export type Rol = z.infer<typeof rolSchema>;

export const paginacionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
});

export interface Pagina<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}
