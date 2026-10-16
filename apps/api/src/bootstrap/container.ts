import type pg from 'pg';
import type { Logger } from 'pino';
import type { Router } from 'express';
import type { AuthContext } from '../application/ports/out/AuthContext';
import type { Clock } from '../application/ports/out/Clock';
import type { UnitOfWork } from '../application/ports/out/UnitOfWork';
import { ConfigurarComisionUseCase } from '../application/commands/ConfigurarComisionUseCase';
import { ProcesarAjusteOrdenUseCase } from '../application/commands/ProcesarAjusteOrdenUseCase';
import { RegistrarAjusteUseCase } from '../application/commands/RegistrarAjusteUseCase';
import { ListarAjustesQuery } from '../application/queries/ListarAjustesQuery';
import { RegistrarVentaConfirmadaUseCase } from '../application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarCuentasPorPagarQuery } from '../application/queries/ListarCuentasPorPagarQuery';
import { ListarPeriodosQuery } from '../application/queries/ListarPeriodosQuery';
import { ListarVentasQuery } from '../application/queries/ListarVentasQuery';
import { ObtenerComisionVigenteQuery } from '../application/queries/ObtenerComisionVigenteQuery';
import { ObtenerEstadoModulo } from '../application/queries/ObtenerEstadoModulo';
import { ObtenerVentaQuery } from '../application/queries/ObtenerVentaQuery';
import { ReporteIngresosQuery } from '../application/queries/ReporteIngresosQuery';
import { ResumenSaldoVendedorQuery } from '../application/queries/ResumenSaldoVendedorQuery';
import type { AppConfig } from '../infrastructure/config/env';
import { createContabilidadRouter } from '../infrastructure/http/express/createContabilidadRouter';
import { JwtAuthContext } from '../infrastructure/integration/auth/JwtAuthContext';
import { MockAuthContext } from '../infrastructure/integration/auth/MockAuthContext';
import { MockSellersGateway } from '../infrastructure/integration/sellers/MockSellersGateway';
import { SystemClock } from '../infrastructure/integration/SystemClock';
import { PgAjusteContableRepository } from '../infrastructure/persistence/postgres/PgAjusteContableRepository';
import { PgConfiguracionComisionRepository } from '../infrastructure/persistence/postgres/PgConfiguracionComisionRepository';
import { PgCuentaPorPagarRepository } from '../infrastructure/persistence/postgres/PgCuentaPorPagarRepository';
import { PgDatabaseHealth } from '../infrastructure/persistence/postgres/PgDatabaseHealth';
import { PgReporteIngresosRepository } from '../infrastructure/persistence/postgres/PgReporteIngresosRepository';
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
  // INTEGRATION_MODE elegirá los adaptadores HTTP/eventos cuando los otros módulos los expongan;
  // por ahora Vendedores solo tiene mock.
  const vendedores = new MockSellersGateway();

  // Casos de uso / consultas
  const obtenerEstado = new ObtenerEstadoModulo(dbHealth, clock);
  const obtenerComision = new ObtenerComisionVigenteQuery(configuracionComision, clock);
  const configurarComision = new ConfigurarComisionUseCase(unitOfWork, clock);
  const registrarVenta = new RegistrarVentaConfirmadaUseCase(unitOfWork, clock);
  const ventas = new PgVentaContableRepository(pool);
  const cuentasPorPagar = new PgCuentaPorPagarRepository(pool);
  const listarVentas = new ListarVentasQuery(ventas, vendedores);
  const obtenerVenta = new ObtenerVentaQuery(ventas, vendedores);
  const listarPeriodos = new ListarPeriodosQuery(ventas);
  const listarCuentasPorPagar = new ListarCuentasPorPagarQuery(cuentasPorPagar, vendedores);
  const resumenSaldoVendedor = new ResumenSaldoVendedorQuery(cuentasPorPagar, vendedores);
  const registrarAjuste = new RegistrarAjusteUseCase(unitOfWork, clock);
  const procesarAjusteOrden = new ProcesarAjusteOrdenUseCase(unitOfWork, clock);
  const listarAjustes = new ListarAjustesQuery(new PgAjusteContableRepository(pool));
  const reporteIngresos = new ReporteIngresosQuery(new PgReporteIngresosRepository(pool));

  const router = createContabilidadRouter({
    logger,
    auth,
    version: VERSION_MODULO,
    integrationMode: config.INTEGRATION_MODE,
    queries: {
      obtenerEstado,
      obtenerComision,
      listarVentas,
      obtenerVenta,
      listarPeriodos,
      listarCuentasPorPagar,
      resumenSaldoVendedor,
      listarAjustes,
      reporteIngresos,
    },
    commands: { configurarComision, registrarVenta, registrarAjuste, procesarAjusteOrden },
  });

  return { router, unitOfWork };
}
