import 'dotenv/config';
import { loadConfig } from '../infrastructure/config/env';
import { createHttpApp, API_PREFIX } from '../infrastructure/http/express/createHttpApp';
import { createLogger } from '../infrastructure/observability/logger';
import { createPool } from '../infrastructure/persistence/postgres/pool';
import { createContabilidadModule } from './container';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');
const pool = createPool(config.DATABASE_URL);
pool.on('error', (err) => logger.error({ err }, 'Error inesperado en el pool de PostgreSQL'));

const { router } = createContabilidadModule({ config, pool, logger });
const app = createHttpApp({ router, logger, corsOrigins: config.CORS_ORIGINS });

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, integrationMode: config.INTEGRATION_MODE, authMode: config.AUTH_MODE },
    `API de contabilidad escuchando en http://localhost:${config.PORT}${API_PREFIX}`,
  );
});

// Cierre ordenado: deja de aceptar conexiones y libera el pool.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Cerrando API de contabilidad');
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
