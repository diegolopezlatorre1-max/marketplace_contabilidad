import cors from 'cors';
import express, { type Express, type Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

export const API_PREFIX = '/api/v1/contabilidad';

interface HttpAppOptions {
  router: Router;
  logger: Logger;
  corsOrigins: string[];
}

/** Servidor HTTP independiente (modo microservicio). */
export function createHttpApp({ router, logger, corsOrigins }: HttpAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, exposedHeaders: ['x-correlation-id'] }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
    }),
  );
  app.use(API_PREFIX, router);
  return app;
}
