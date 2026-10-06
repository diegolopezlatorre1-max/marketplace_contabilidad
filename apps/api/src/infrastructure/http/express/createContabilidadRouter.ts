import express, { Router } from 'express';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { HealthResponse } from '@contabilidad/contracts';
import type { ObtenerEstadoModulo } from '../../../application/queries/ObtenerEstadoModulo';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import { authenticate } from '../middlewares/auth';
import { correlationId } from '../middlewares/correlationId';
import { errorHandler, notFound } from '../middlewares/errorHandler';
import { buildOpenApi } from '../openapi';
import { healthRoutes, meRoutes } from '../routes/systemRoutes';

export interface RouterDeps {
  logger: Logger;
  auth: AuthContext;
  version: string;
  integrationMode: HealthResponse['integrationMode'];
  queries: { obtenerEstado: ObtenerEstadoModulo };
}

/**
 * Router autocontenido del módulo (validación, auth, errores incluidos).
 * Se monta en /api/v1/contabilidad tanto en el servidor propio como dentro de
 * la aplicación del marketplace (monolito modular), sin cambios.
 */
export function createContabilidadRouter(deps: RouterDeps): Router {
  const router = Router();
  router.use(correlationId);
  router.use(express.json({ limit: '1mb' }));

  // Rutas públicas
  router.use(
    healthRoutes({
      obtenerEstado: deps.queries.obtenerEstado,
      version: deps.version,
      integrationMode: deps.integrationMode,
    }),
  );
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApi(deps.version)));
  router.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApi(deps.version));
  });

  // Rutas protegidas
  router.use(authenticate(deps.auth));
  router.use(meRoutes());
  // Sprint 1+: router.use(ventasRoutes(...)), router.use(eventosRoutes(...)), ...

  router.use(notFound);
  router.use(errorHandler(deps.logger));
  return router;
}
