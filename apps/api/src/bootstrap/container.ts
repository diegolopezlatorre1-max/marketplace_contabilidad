import type pg from 'pg';
import type { Logger } from 'pino';
import type { Router } from 'express';
import type { AuthContext } from '../application/ports/out/AuthContext';
import type { Clock } from '../application/ports/out/Clock';
import type { UnitOfWork } from '../application/ports/out/UnitOfWork';
import { ObtenerEstadoModulo } from '../application/queries/ObtenerEstadoModulo';
import type { AppConfig } from '../infrastructure/config/env';
import { createContabilidadRouter } from '../infrastructure/http/express/createContabilidadRouter';
import { JwtAuthContext } from '../infrastructure/integration/auth/JwtAuthContext';
import { MockAuthContext } from '../infrastructure/integration/auth/MockAuthContext';
import { SystemClock } from '../infrastructure/integration/SystemClock';
import { PgDatabaseHealth } from '../infrastructure/persistence/postgres/PgDatabaseHealth';
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
  // INTEGRATION_MODE elegirá los gateways de Órdenes, Vendedores y Pagos (Sprint 1+).

  // Casos de uso / consultas
  const obtenerEstado = new ObtenerEstadoModulo(dbHealth, clock);

  const router = createContabilidadRouter({
    logger,
    auth,
    version: VERSION_MODULO,
    integrationMode: config.INTEGRATION_MODE,
    queries: { obtenerEstado },
  });

  return { router, unitOfWork };
}
