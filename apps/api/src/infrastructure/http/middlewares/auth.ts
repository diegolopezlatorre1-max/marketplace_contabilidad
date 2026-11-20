import type { RequestHandler } from 'express';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import { tieneAlgunRol, type Rol } from '../../../application/security';
import { HttpError } from '../HttpError';
import { getActor, setActor } from '../requestContext';

/** Exige "Authorization: Bearer <token>" y resuelve el actor mediante el puerto AuthContext. */
export function authenticate(auth: AuthContext): RequestHandler {
  return async (req, res, next) => {
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
