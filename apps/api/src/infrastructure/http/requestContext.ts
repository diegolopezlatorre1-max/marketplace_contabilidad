import type { Response } from 'express';
import type { ContextoEjecucion } from '../../application/ports/in/UseCase';
import type { Actor } from '../../application/security';
import { HttpError } from './HttpError';

/** Datos por petición guardados en res.locals por los middlewares. */
interface LocalsContabilidad {
  correlationId?: string;
  actor?: Actor;
}

function locals(res: Response): LocalsContabilidad {
  return res.locals as LocalsContabilidad;
}

export function setCorrelationId(res: Response, id: string): void {
  locals(res).correlationId = id;
}

export function getCorrelationId(res: Response): string | undefined {
  return locals(res).correlationId;
}

export function setActor(res: Response, actor: Actor): void {
  locals(res).actor = actor;
}

export function getActor(res: Response): Actor {
  const actor = locals(res).actor;
  if (!actor) throw HttpError.noAutenticado();
  return actor;
}

/** Contexto para invocar un caso de uso desde un controller. */
export function contexto(res: Response): ContextoEjecucion {
  const correlationId = getCorrelationId(res);
  return { actor: getActor(res), ...(correlationId ? { correlationId } : {}) };
}
