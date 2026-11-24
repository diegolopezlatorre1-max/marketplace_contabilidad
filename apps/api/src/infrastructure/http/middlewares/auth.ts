import type { RequestHandler } from 'express';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import { esServicio, tieneAlgunRol, type Actor, type Rol } from '../../../application/security';
import { HttpError } from '../HttpError';
import { getActor, setActor } from '../requestContext';

/** Autenticación de módulos por clave (cabecera x-api-key). */
export interface ServiceAuthenticator {
  autenticar(apiKey: string): Actor | null;
}

/**
 * Resuelve el actor de la petición:
 *  - `x-api-key: <clave>` → módulo del marketplace (servicio), si hay claves configuradas.
 *  - `Authorization: Bearer <token>` → usuario, mediante el puerto AuthContext.
 * Una clave inválida es 401 (no se intenta el token).
 */
export function authenticate(auth: AuthContext, servicios?: ServiceAuthenticator): RequestHandler {
  return async (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (apiKey !== undefined) {
      const servicio = apiKey && servicios ? servicios.autenticar(apiKey) : null;
      if (!servicio) throw HttpError.noAutenticado();
      setActor(res, servicio);
      next();
      return;
    }
    const header = req.header('authorization') ?? '';
    const [esquema, token] = header.split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) throw HttpError.noAutenticado();
    const actor = await auth.autenticar(token);
    if (!actor) throw HttpError.noAutenticado();
    setActor(res, actor);
    next();
  };
}

/** Restringe la ruta a uno o más roles. */
export function requireRole(...roles: Rol[]): RequestHandler {
  return (_req, res, next) => {
    if (!tieneAlgunRol(getActor(res), roles)) throw HttpError.noAutorizado();
    next();
  };
}

/** Restringe la ruta a los módulos del marketplace autenticados como servicio (eventos). */
export function requireServicio(): RequestHandler {
  return (_req, res, next) => {
    if (!esServicio(getActor(res))) throw HttpError.noAutorizado();
    next();
  };
}
