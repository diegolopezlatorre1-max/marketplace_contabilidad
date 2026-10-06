import { Router } from 'express';
import type { HealthResponse, UsuarioActualResponse } from '@contabilidad/contracts';
import type { ObtenerEstadoModulo } from '../../../application/queries/ObtenerEstadoModulo';
import { getActor } from '../requestContext';

interface Deps {
  obtenerEstado: ObtenerEstadoModulo;
  version: string;
  integrationMode: HealthResponse['integrationMode'];
}

/** GET /health (público). */
export function healthRoutes({ obtenerEstado, version, integrationMode }: Deps): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const estado = await obtenerEstado.execute();
    const body: HealthResponse = {
      status: estado.status,
      modulo: 'contabilidad',
      version,
      integrationMode,
      checks: estado.checks,
      fecha: estado.fecha.toISOString(),
    };
    res.status(estado.status === 'ok' ? 200 : 503).json(body);
  });
  return router;
}

/** GET /me (autenticado). */
export function meRoutes(): Router {
  const router = Router();
  router.get('/me', (_req, res) => {
    const actor = getActor(res);
    const body: UsuarioActualResponse = {
      id: actor.id,
      nombre: actor.nombre,
      roles: [...actor.roles],
    };
    res.json(body);
  });
  return router;
}
