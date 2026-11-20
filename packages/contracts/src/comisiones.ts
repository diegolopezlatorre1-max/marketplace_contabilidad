import { z } from 'zod';

/** Día contable AAAA-MM-DD (hora de Colombia). */
export const fechaContableSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida: use el formato AAAA-MM-DD');

/** Porcentaje como string decimal entre 0 y 100 con máximo 4 decimales ("12.5"). */
export const porcentajeSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Porcentaje inválido: máximo 4 decimales')
  .refine((v) => Number(v) <= 100, { message: 'El porcentaje debe estar entre 0 y 100' });

export const ALCANCES_COMISION = ['GLOBAL', 'VENDEDOR', 'CATEGORIA'] as const;
export type AlcanceComision = (typeof ALCANCES_COMISION)[number];

/** PUT /comisiones/configuracion (solo ADMIN_FINANCIERO; en el Sprint 1, alcance GLOBAL). */
export const configurarComisionSchema = z.object({
  porcentaje: porcentajeSchema,
  vigenteDesde: fechaContableSchema,
});
export type ConfigurarComisionRequest = z.infer<typeof configurarComisionSchema>;

/** GET /comisiones/configuracion?fecha=AAAA-MM-DD (por defecto, hoy). */
export const obtenerComisionQuerySchema = z.object({
  fecha: fechaContableSchema.optional(),
});

export interface VigenciaComisionDto {
  id: string;
  porcentaje: string;
  alcance: AlcanceComision;
  referenciaId: string | null;
  vigenteDesde: string;
  /** Inclusive; null = vigencia abierta. */
  vigenteHasta: string | null;
  creadoPor: string;
}

export interface ConfiguracionComisionResponse {
  /** Fecha consultada. */
  fecha: string;
  /** Vigencia que aplica en `fecha` (null si no hay configuración). */
  vigente: VigenciaComisionDto | null;
  /** De la más reciente a la más antigua. */
  historial: VigenciaComisionDto[];
}
