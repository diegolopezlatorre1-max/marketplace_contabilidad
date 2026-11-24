import type pg from 'pg';
import type { Logger } from 'pino';
import type { Router } from 'express';
import type { AuthContext } from '../application/ports/out/AuthContext';
import type { Clock } from '../application/ports/out/Clock';
import type { UnitOfWork } from '../application/ports/out/UnitOfWork';
import { ConciliarPagoUseCase } from '../application/commands/ConciliarPagoUseCase';
import { ActualizarEscrowUseCase } from '../application/commands/ActualizarEscrowUseCase';
import { ConfigurarComisionUseCase } from '../application/commands/ConfigurarComisionUseCase';
import { ImportarPagosRecibidosUseCase } from '../application/commands/ImportarPagosRecibidosUseCase';
import { RegistrarPagoRecibidoUseCase } from '../application/commands/RegistrarPagoRecibidoUseCase';
import {
  ListarConciliacionesQuery,
  ListarPagosRecibidosQuery,
  ObtenerConciliacionQuery,
} from '../application/queries/ConciliacionQueries';
import { PoliticaConciliacion } from '../domain/conciliacion/Conciliacion';
import { ProcesarAjusteOrdenUseCase } from '../application/commands/ProcesarAjusteOrdenUseCase';
import { RegistrarAjusteUseCase } from '../application/commands/RegistrarAjusteUseCase';
import { RegistrarPagoVendedorUseCase } from '../application/commands/RegistrarPagoVendedorUseCase';
import { ListarPagosVendedorQuery } from '../application/queries/ListarPagosVendedorQuery';
import { EstadoVendedorQuery } from '../application/queries/EstadoVendedorQuery';
import { ConsultarAuditoriaQuery } from '../application/queries/ConsultarAuditoriaQuery';
import { ExportarExcelUseCase } from '../application/queries/ExportarExcelUseCase';
import { ExcelJsExporter } from '../infrastructure/integration/spreadsheet/ExcelJsExporter';
import { PgExportacionRepository } from '../infrastructure/persistence/postgres/PgExportacionRepository';
import { ListarAjustesQuery } from '../application/queries/ListarAjustesQuery';
import { RegistrarVentaConfirmadaUseCase } from '../application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarCuentasPorPagarQuery } from '../application/queries/ListarCuentasPorPagarQuery';
import { ListarPeriodosQuery } from '../application/queries/ListarPeriodosQuery';
import { ListarVentasQuery } from '../application/queries/ListarVentasQuery';
import { ObtenerComisionVigenteQuery } from '../application/queries/ObtenerComisionVigenteQuery';
import { ObtenerEscrowQuery } from '../application/queries/ObtenerEscrowQuery';
import { ObtenerEstadoModulo } from '../application/queries/ObtenerEstadoModulo';
import { ObtenerVentaQuery } from '../application/queries/ObtenerVentaQuery';
import { ReporteIngresosQuery } from '../application/queries/ReporteIngresosQuery';
import { ResumenSaldoVendedorQuery } from '../application/queries/ResumenSaldoVendedorQuery';
import type { AppConfig } from '../infrastructure/config/env';
import { createContabilidadRouter } from '../infrastructure/http/express/createContabilidadRouter';
import { ApiKeyServiceAuth } from '../infrastructure/integration/auth/ApiKeyServiceAuth';
import { JwksAuthContext } from '../infrastructure/integration/auth/JwksAuthContext';
import { MockAuthContext } from '../infrastructure/integration/auth/MockAuthContext';
import {
  crearClienteSupabase,
  SupabaseAuthContext,
} from '../infrastructure/integration/auth/SupabaseAuthContext';
import { MockSellersGateway } from '../infrastructure/integration/sellers/MockSellersGateway';
import { SystemClock } from '../infrastructure/integration/SystemClock';
import { PgAjusteContableRepository } from '../infrastructure/persistence/postgres/PgAjusteContableRepository';
import { PgConfiguracionComisionRepository } from '../infrastructure/persistence/postgres/PgConfiguracionComisionRepository';
import { PgConciliacionRepository } from '../infrastructure/persistence/postgres/PgConciliacionRepository';
import { PgCuentaPorPagarRepository } from '../infrastructure/persistence/postgres/PgCuentaPorPagarRepository';
import { PgPagoRecibidoRepository } from '../infrastructure/persistence/postgres/PgPagoRecibidoRepository';
import { PgPagoVendedorRepository } from '../infrastructure/persistence/postgres/PgPagoVendedorRepository';
import { PgEstadoVendedorRepository } from '../infrastructure/persistence/postgres/PgEstadoVendedorRepository';
import { PgAuditoriaRepository } from '../infrastructure/persistence/postgres/PgAuditoriaRepository';
import { PgEscrowRepository } from '../infrastructure/persistence/postgres/PgEscrowRepository';
import { PgDatabaseHealth } from '../infrastructure/persistence/postgres/PgDatabaseHealth';
import { PgOutboxMonitor } from '../infrastructure/persistence/postgres/PgOutboxMonitor';
import { PgReporteIngresosRepository } from '../infrastructure/persistence/postgres/PgReporteIngresosRepository';
import { PgVentaContableRepository } from '../infrastructure/persistence/postgres/PgVentaContableRepository';
import { PgUnitOfWork } from '../infrastructure/persistence/postgres/PgUnitOfWork';

export const VERSION_MODULO = '0.1.0';

export interface ContabilidadModuleOptions {
  config: Pick<AppConfig, 'INTEGRATION_MODE' | 'AUTH_MODE'> &
    Partial<Pick<AppConfig, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'SERVICE_API_KEYS'>>;
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
 * función con su configuración y montar `router` en /api/contabilidad.
 */
export function createContabilidadModule(opts: ContabilidadModuleOptions): ContabilidadModule {
  const { config, pool, logger, overrides } = opts;

  // Adaptadores de salida
  const clock = overrides?.clock ?? new SystemClock();
  const auth = overrides?.auth ?? crearAuthContext(config);
  const servicios = new ApiKeyServiceAuth(config.SERVICE_API_KEYS ?? {});
  const unitOfWork = new PgUnitOfWork(pool);
  const dbHealth = new PgDatabaseHealth(pool);
  const configuracionComision = new PgConfiguracionComisionRepository(pool);
  // INTEGRATION_MODE elegirá los adaptadores HTTP/eventos cuando los otros módulos los expongan;
  // por ahora Vendedores solo tiene mock.
  const vendedores = new MockSellersGateway();

  // Casos de uso / consultas
  const obtenerEstado = new ObtenerEstadoModulo(dbHealth, clock, new PgOutboxMonitor(pool));
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
  // HU-CON-10: pago al vendedor, FIFO por periodo (D-06).
  const registrarPagoVendedor = new RegistrarPagoVendedorUseCase(unitOfWork, clock);
  const pagosVendedor = new PgPagoVendedorRepository(pool);
  const listarPagosVendedor = new ListarPagosVendedorQuery(pagosVendedor);
  // Escrow (GUIA_EQUIPO_6): retención de 72 h tras la entrega y bloqueo por PQR.
  const actualizarEscrow = new ActualizarEscrowUseCase(unitOfWork, clock);
  const obtenerEscrow = new ObtenerEscrowQuery(new PgEscrowRepository(pool), clock);
  // HU-CON-08: exportación a Excel; reutiliza la consulta del reporte (mismos números).
  const exportarExcel = new ExportarExcelUseCase(
    reporteIngresos,
    new PgExportacionRepository(pool),
    new ExcelJsExporter(),
    vendedores,
    clock,
  );
  // HU-CON-11: consulta de la auditoría (solo ADMIN).
  const consultarAuditoria = new ConsultarAuditoriaQuery(new PgAuditoriaRepository(pool));
  // HU-CON-07: estado financiero por vendedor.
  const estadoVendedor = new EstadoVendedorQuery(
    new PgEstadoVendedorRepository(pool),
    pagosVendedor,
    vendedores,
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
    servicios,
    version: VERSION_MODULO,
    integrationMode: config.INTEGRATION_MODE,
    queries: {
      obtenerEstado,
      obtenerComision,
      listarVentas,
      obtenerVenta,
      listarPeriodos,
      listarCuentasPorPagar,
      listarPagos,
      listarConciliaciones,
      obtenerConciliacion,
      resumenSaldoVendedor,
      listarAjustes,
      reporteIngresos,
      listarPagosVendedor,
      estadoVendedor,
      consultarAuditoria,
      exportarExcel,
      obtenerEscrow,
    },
    commands: {
      configurarComision,
      registrarVenta,
      registrarPago,
      importarPagos,
      conciliarPago,
      registrarAjuste,
      procesarAjusteOrden,
      registrarPagoVendedor,
      actualizarEscrow,
    },
  });

  return { router, unitOfWork };
}

/**
 * AUTH_MODE=supabase valida el access token con Supabase Auth (getClaims); jwks verifica la firma
 * con las claves públicas del proyecto (solo SUPABASE_URL); mock usa tokens de desarrollo.
 */
function crearAuthContext(config: ContabilidadModuleOptions['config']): AuthContext {
  if (config.AUTH_MODE === 'jwks') {
    if (!config.SUPABASE_URL) throw new Error('AUTH_MODE=jwks requiere SUPABASE_URL');
    return new JwksAuthContext({ supabaseUrl: config.SUPABASE_URL });
  }
  if (config.AUTH_MODE !== 'supabase') return new MockAuthContext();
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('AUTH_MODE=supabase requiere SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY');
  }
  return new SupabaseAuthContext(
    crearClienteSupabase({
      url: config.SUPABASE_URL,
      publishableKey: config.SUPABASE_PUBLISHABLE_KEY,
    }),
  );
}
