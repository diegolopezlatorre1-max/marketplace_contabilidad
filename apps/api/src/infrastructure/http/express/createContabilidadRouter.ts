import express, { Router } from 'express';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { HealthResponse } from '@contabilidad/contracts';
import type { ConciliarPagoUseCase } from '../../../application/commands/ConciliarPagoUseCase';
import type { ConfigurarComisionUseCase } from '../../../application/commands/ConfigurarComisionUseCase';
import type { ImportarPagosRecibidosUseCase } from '../../../application/commands/ImportarPagosRecibidosUseCase';
import type { RegistrarPagoRecibidoUseCase } from '../../../application/commands/RegistrarPagoRecibidoUseCase';
import type {
  ListarConciliacionesQuery,
  ListarPagosRecibidosQuery,
  ObtenerConciliacionQuery,
} from '../../../application/queries/ConciliacionQueries';
import type { ProcesarAjusteOrdenUseCase } from '../../../application/commands/ProcesarAjusteOrdenUseCase';
import type { RegistrarAjusteUseCase } from '../../../application/commands/RegistrarAjusteUseCase';
import type { ListarAjustesQuery } from '../../../application/queries/ListarAjustesQuery';
import type { RegistrarVentaConfirmadaUseCase } from '../../../application/commands/RegistrarVentaConfirmadaUseCase';
import type { ListarCuentasPorPagarQuery } from '../../../application/queries/ListarCuentasPorPagarQuery';
import type { ListarPeriodosQuery } from '../../../application/queries/ListarPeriodosQuery';
import type { ListarVentasQuery } from '../../../application/queries/ListarVentasQuery';
import type { ObtenerComisionVigenteQuery } from '../../../application/queries/ObtenerComisionVigenteQuery';
import type { ObtenerEstadoModulo } from '../../../application/queries/ObtenerEstadoModulo';
import type { ObtenerVentaQuery } from '../../../application/queries/ObtenerVentaQuery';
import type { ReporteIngresosQuery } from '../../../application/queries/ReporteIngresosQuery';
import type { ResumenSaldoVendedorQuery } from '../../../application/queries/ResumenSaldoVendedorQuery';
import type { AuthContext } from '../../../application/ports/out/AuthContext';
import { authenticate } from '../middlewares/auth';
import { correlationId } from '../middlewares/correlationId';
import { errorHandler, notFound } from '../middlewares/errorHandler';
import { buildOpenApi } from '../openapi';
import { ajustesRoutes } from '../routes/ajustesRoutes';
import { comisionesRoutes } from '../routes/comisionesRoutes';
import { conciliacionesRoutes } from '../routes/conciliacionesRoutes';
import { cuentasPorPagarRoutes } from '../routes/cuentasPorPagarRoutes';
import { reportesRoutes } from '../routes/reportesRoutes';
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
    obtenerVenta: ObtenerVentaQuery;
    listarPeriodos: ListarPeriodosQuery;
    listarCuentasPorPagar: ListarCuentasPorPagarQuery;
    listarPagos: ListarPagosRecibidosQuery;
    listarConciliaciones: ListarConciliacionesQuery;
    obtenerConciliacion: ObtenerConciliacionQuery;
    resumenSaldoVendedor: ResumenSaldoVendedorQuery;
    listarAjustes: ListarAjustesQuery;
    reporteIngresos: ReporteIngresosQuery;
  };
  commands: {
    configurarComision: ConfigurarComisionUseCase;
    registrarVenta: RegistrarVentaConfirmadaUseCase;
    registrarPago: RegistrarPagoRecibidoUseCase;
    importarPagos: ImportarPagosRecibidosUseCase;
    conciliarPago: ConciliarPagoUseCase;
    registrarAjuste: RegistrarAjusteUseCase;
    procesarAjusteOrden: ProcesarAjusteOrdenUseCase;
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
      obtenerVenta: deps.queries.obtenerVenta,
      listarPeriodos: deps.queries.listarPeriodos,
    }),
  );
  router.use(
    cuentasPorPagarRoutes({
      listarCuentasPorPagar: deps.queries.listarCuentasPorPagar,
      resumenSaldoVendedor: deps.queries.resumenSaldoVendedor,
    }),
  );
  router.use(
    conciliacionesRoutes({
      registrarPago: deps.commands.registrarPago,
      importarPagos: deps.commands.importarPagos,
      conciliarPago: deps.commands.conciliarPago,
      listarPagos: deps.queries.listarPagos,
      listarConciliaciones: deps.queries.listarConciliaciones,
      obtenerConciliacion: deps.queries.obtenerConciliacion,
    }),
  );
  router.use(
    ajustesRoutes({
      registrarAjuste: deps.commands.registrarAjuste,
      procesarAjusteOrden: deps.commands.procesarAjusteOrden,
      listarAjustes: deps.queries.listarAjustes,
    }),
  );
  router.use(reportesRoutes({ reporteIngresos: deps.queries.reporteIngresos }));

  router.use(notFound);
  router.use(errorHandler(deps.logger));
  return router;
}
