import type pg from 'pg';
import type { Logger } from 'pino';
import type { Router } from 'express';
import type { AuthContext } from '../application/ports/out/AuthContext';
import type { Clock } from '../application/ports/out/Clock';
import type { UnitOfWork } from '../application/ports/out/UnitOfWork';
import { ConciliarPagoUseCase } from '../application/commands/ConciliarPagoUseCase';
import { ConfigurarComisionUseCase } from '../application/commands/ConfigurarComisionUseCase';
import { ImportarPagosRecibidosUseCase } from '../application/commands/ImportarPagosRecibidosUseCase';
import { RegistrarPagoRecibidoUseCase } from '../application/commands/RegistrarPagoRecibidoUseCase';
import {
  ListarConciliacionesQuery,
  ListarPagosRecibidosQuery,
  ObtenerConciliacionQuery,
} from '../application/queries/ConciliacionQueries';
import { PoliticaConciliacion } from '../domain/conciliacion/Conciliacion';
import { RegistrarVentaConfirmadaUseCase } from '../application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarCuentasPorPagarQuery } from '../application/queries/ListarCuentasPorPagarQuery';
import { ListarPeriodosQuery } from '../application/queries/ListarPeriodosQuery';
import { ListarVentasQuery } from '../application/queries/ListarVentasQuery';
import { ObtenerComisionVigenteQuery } from '../application/queries/ObtenerComisionVigenteQuery';
import { ObtenerEstadoModulo } from '../application/queries/ObtenerEstadoModulo';
import type { AppConfig } from '../infrastructure/config/env';
import { createContabilidadRouter } from '../infrastructure/http/express/createContabilidadRouter';
import { JwtAuthContext } from '../infrastructure/integration/auth/JwtAuthContext';
import { MockAuthContext } from '../infrastructure/integration/auth/MockAuthContext';
import { SystemClock } from '../infrastructure/integration/SystemClock';
import { PgConfiguracionComisionRepository } from '../infrastructure/persistence/postgres/PgConfiguracionComisionRepository';
import { PgConciliacionRepository } from '../infrastructure/persistence/postgres/PgConciliacionRepository';
import { PgCuentaPorPagarRepository } from '../infrastructure/persistence/postgres/PgCuentaPorPagarRepository';
import { PgPagoRecibidoRepository } from '../infrastructure/persistence/postgres/PgPagoRecibidoRepository';
import { PgDatabaseHealth } from '../infrastructure/persistence/postgres/PgDatabaseHealth';
import { PgVentaContableRepository } from '../infrastructure/persistence/postgres/PgVentaContableRepository';
import { PgUnitOfWork } from '../infrastructure/persistence/postgres/PgUnitOfWork';

export const VERSION_MODULO = '0.1.0';

export interface ContabilidadModuleOptions {
  config: Pick<AppConfig, 'INTEGRATION_MODE' | 'AUTH_MODE'>;
  pool: pg.Pool;
  logger: Logger;
  /** Permite inyectar adaptadores alternativos (p. ej. en pruebas o desde el marketplace). */
  overrides?: Partial<{ auth: AuthContext; clock: Clock }>;
}

export interface ContabilidadModule {
  router: Router;
  unitOfWork: UnitOfWork;
}

/**
 * Composition root: el ÚNICO lugar donde se eligen adaptadores y se cablean
 * con los casos de uso. Integrar el módulo al marketplace = llamar a esta
 * función con su configuración y montar `router` en /api/v1/contabilidad.
 */
export function createContabilidadModule(opts: ContabilidadModuleOptions): ContabilidadModule {
  const { config, pool, logger, overrides } = opts;

  // Adaptadores de salida
  const clock = overrides?.clock ?? new SystemClock();
  const auth =
    overrides?.auth ?? (config.AUTH_MODE === 'jwt' ? new JwtAuthContext() : new MockAuthContext());
  const unitOfWork = new PgUnitOfWork(pool);
  const dbHealth = new PgDatabaseHealth(pool);
  const configuracionComision = new PgConfiguracionComisionRepository(pool);
  // INTEGRATION_MODE elegirá los gateways de Órdenes, Vendedores y Pagos (Sprint 1+).

  // Casos de uso / consultas
  const obtenerEstado = new ObtenerEstadoModulo(dbHealth, clock);
  const obtenerComision = new ObtenerComisionVigenteQuery(configuracionComision, clock);
  const configurarComision = new ConfigurarComisionUseCase(unitOfWork, clock);
  const registrarVenta = new RegistrarVentaConfirmadaUseCase(unitOfWork, clock);
  const ventas = new PgVentaContableRepository(pool);
  const listarVentas = new ListarVentasQuery(ventas);
  const listarPeriodos = new ListarPeriodosQuery(ventas);
  const listarCuentasPorPagar = new ListarCuentasPorPagarQuery(
    new PgCuentaPorPagarRepository(pool),
  );

  // HU-CON-04. Tolerancia de conciliación 0 hasta que el contador defina otra (D-08).
  const politicaConciliacion = new PoliticaConciliacion();
  const registrarPago = new RegistrarPagoRecibidoUseCase(unitOfWork, clock, politicaConciliacion);
  const importarPagos = new ImportarPagosRecibidosUseCase(unitOfWork, clock, politicaConciliacion);
  const conciliarPago = new ConciliarPagoUseCase(unitOfWork, clock, politicaConciliacion);
  const conciliaciones = new PgConciliacionRepository(pool);
  const listarPagos = new ListarPagosRecibidosQuery(new PgPagoRecibidoRepository(pool));
  const listarConciliaciones = new ListarConciliacionesQuery(conciliaciones);
  const obtenerConciliacion = new ObtenerConciliacionQuery(conciliaciones);

  const router = createContabilidadRouter({
    logger,
    auth,
    version: VERSION_MODULO,
    integrationMode: config.INTEGRATION_MODE,
    queries: {
      obtenerEstado,
      obtenerComision,
      listarVentas,
      listarPeriodos,
      listarCuentasPorPagar,
      listarPagos,
      listarConciliaciones,
      obtenerConciliacion,
    },
    commands: { configurarComision, registrarVenta, registrarPago, importarPagos, conciliarPago },
  });

  return { router, unitOfWork };
}
