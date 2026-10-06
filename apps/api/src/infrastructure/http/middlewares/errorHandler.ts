import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { CodigoError, ProblemDetails } from '@contabilidad/contracts';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { DomainError } from '../../../domain/shared';
import { HttpError } from '../HttpError';
import { getCorrelationId } from '../requestContext';

const TIPO_BASE = 'https://marketplace/contabilidad/errores/';

/** Estado HTTP para cada error de dominio; por defecto 422 (regla de negocio). */
function statusDeDominio(code: string): number {
  if (code === 'NO_AUTORIZADO') return 403;
  if (code === 'NO_ENCONTRADO' || code.endsWith('_INEXISTENTE')) return 404;
  if (code === 'CONFLICTO' || code.endsWith('_DUPLICADA')) return 409;
  return 422;
}

function aProblem(err: unknown): ProblemDetails {
  if (err instanceof HttpError) {
    return {
      type: TIPO_BASE + err.code,
      title: err.title,
      status: err.status,
      code: err.code,
      ...(err.detail ? { detail: err.detail } : {}),
    };
  }
  if (err instanceof ZodError) {
    return {
      type: TIPO_BASE + 'VALIDACION',
      title: 'Datos inválidos',
      status: 400,
      code: 'VALIDACION',
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  if (err instanceof DomainError) {
    const code = (err.code === 'VALOR_INVALIDO' ? 'VALIDACION' : err.code) as CodigoError;
    return {
      type: TIPO_BASE + code,
      title: code === 'VALIDACION' ? 'Datos inválidos' : 'Regla de negocio incumplida',
      status: code === 'VALIDACION' ? 400 : statusDeDominio(code),
      code,
      detail: err.message,
    };
  }
  const e = err as { type?: string; code?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    return {
      type: TIPO_BASE + 'VALIDACION',
      title: 'JSON mal formado',
      status: 400,
      code: 'VALIDACION',
    };
  }
  if (e?.type === 'entity.too.large') {
    return {
      type: TIPO_BASE + 'VALIDACION',
      title: 'Cuerpo de la petición demasiado grande',
      status: 413,
      code: 'VALIDACION',
    };
  }
  // Violación de unicidad en PostgreSQL: segunda barrera de idempotencia.
  if (e?.code === '23505') {
    return {
      type: TIPO_BASE + 'CONFLICTO',
      title: 'El registro ya existe',
      status: 409,
      code: 'CONFLICTO',
    };
  }
  return {
    type: TIPO_BASE + 'ERROR_INTERNO',
    title: 'Error interno',
    status: 500,
    code: 'ERROR_INTERNO',
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const problem = aProblem(err);
    const correlationId = getCorrelationId(res);
    if (correlationId) problem.correlationId = correlationId;
    if (problem.status >= 500) {
      logger.error({ err, correlationId, path: req.originalUrl }, 'Error no controlado');
    }
    res.status(problem.status).type('application/problem+json').json(problem);
  };
}

export const notFound: RequestHandler = (req) => {
  throw HttpError.noEncontrado(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
};
