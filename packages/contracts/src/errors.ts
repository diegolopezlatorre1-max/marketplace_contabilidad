/**
 * Formato de error estándar (RFC 7807, application/problem+json).
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: CodigoError;
  correlationId?: string;
  errors?: Array<{ path: string; message: string }>;
}

export const CODIGOS_ERROR = [
  'VALIDACION',
  'NO_AUTENTICADO',
  'NO_AUTORIZADO',
  'NO_ENCONTRADO',
  'CONFLICTO',
  'REGLA_DE_NEGOCIO',
  'ERROR_INTERNO',
  'ORDEN_NO_CONFIRMADA',
  'ORDEN_DUPLICADA',
  'ORDEN_INEXISTENTE',
  'AJUSTE_EXCEDE_SALDO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];
