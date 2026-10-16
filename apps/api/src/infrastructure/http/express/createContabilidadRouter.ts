import express, { Router } from 'express';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { HealthResponse } from '@contabilidad/contracts';
import type { ConfigurarComisionUseCase } from '../../../application/commands/ConfigurarComisionUseCase';
import type { RegistrarVentaConfirmadaUseCase } from '../../../application/commands/RegistrarVentaConfirmadaUseCase';
import type { ListarVentasQuery } from '../../../application/queries/ListarVentasQuery';
import type { ObtenerComisionVigenteQuery } from '../../../application/queries/ObtenerComisionVigenteQuery';
import type { ObtenerEstadoModulo } from '../../../application/queries/ObtenerEstadoModulo';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import { authenticate } from '../middlewares/auth';
import { correlationId } from '../middlewares/correlationId';
import { errorHandler, notFound } from '../middlewares/errorHandler';
import { buildOpenApi } from '../openapi';
import { comisionesRoutes } from '../routes/comisionesRoutes';
import { healthRoutes, meRoutes } from '../routes/systemRoutes';
import { ventasRoutes } from '../routes/ventasRoutes';

export interface RouterDeps {
  logger: Logger;
  auth: AuthContext;
  version: string;
  integrationMode: HealthResponse['integrationMode'];
  queries: {
    obtenerEstado: ObtenerEstadoModulo;
    obtenerComision: ObtenerComisionVigenteQuery;
    listarVentas: ListarVentasQuery;
  };
  commands: {
    configurarComision: ConfigurarComisionUseCase;
    registrarVenta: RegistrarVentaConfirmadaUseCase;
  };
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
  router.use(
    comisionesRoutes({
      configurarComision: deps.commands.configurarComision,
      obtenerComision: deps.queries.obtenerComision,
    }),
  );
  router.use(
    ventasRoutes({
      registrarVenta: deps.commands.registrarVenta,
      listarVentas: deps.queries.listarVentas,
    }),
  );

  router.use(notFound);
  router.use(errorHandler(deps.logger));
  return router;
}
