import cors from 'cors';
import express, { type Express, type RequestHandler, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ProblemDetails } from '@contabilidad/contracts';

/** Prefijo de la API (GUIA_EQUIPO_6, sección 9). */
export const API_PREFIX = '/api/contabilidad';
/**
 * Prefijo anterior, que se mantiene como alias temporal para no romper a consumidores que ya lo
 * usen. Responde igual pero con la cabecera Deprecation; se retirará al anunciarlo a los equipos.
 */
export const LEGACY_API_PREFIX = '/api/v1/contabilidad';

/** Rutas públicas que la guía publica en la raíz del servicio (GET /health, Swagger en /docs). */
const RUTAS_RAIZ = ['/health', '/docs', '/openapi.json'];

/** Límite de peticiones por IP y ventana (express-rate-limit). */
export interface RateLimitOptions {
  windowMs: number;
  /** Rutas de usuarios (consultas y operaciones). */
  general: number;
  /** /eventos/*: alto, para no frenar a módulos que envían eventos en lote. */
  eventos: number;
  /** /exportaciones/*: estricto, porque genera archivos Excel. */
  exportaciones: number;
}

interface HttpAppOptions {
  router: Router;
  logger: Logger;
  corsOrigins: string[];
  /** Sin esta opción no se limita (pruebas o cuando el marketplace aplica su propio límite). */
  rateLimit?: RateLimitOptions;
}

function limitador(windowMs: number, limit: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      const problem: ProblemDetails = {
        type: 'https://marketplace/contabilidad/errores/DEMASIADAS_PETICIONES',
        title: 'Demasiadas peticiones',
        status: 429,
        detail: 'Se superó el límite de peticiones; intente de nuevo más tarde',
        code: 'DEMASIADAS_PETICIONES',
      };
      res.status(429).type('application/problem+json').json(problem);
    },
  });
}

function aplicarLimites(app: Express, prefijo: string, opciones: RateLimitOptions): void {
  const { windowMs } = opciones;
  const eventos = limitador(windowMs, opciones.eventos);
  const exportaciones = limitador(windowMs, opciones.exportaciones);
  const general = limitador(windowMs, opciones.general);
  app.use(`${prefijo}/eventos`, eventos);
  app.use(`${prefijo}/exportaciones`, exportaciones);
  app.use(prefijo, (req, res, next) => {
    // /eventos y /exportaciones ya tienen su propio límite; /health y la documentación no se limitan.
    if (/^\/(eventos|exportaciones|health|docs|openapi\.json)(\/|$)/.test(req.path)) {
      next();
      return;
    }
    void general(req, res, next);
  });
}

/** Servidor HTTP independiente (modo microservicio). */
export function createHttpApp({
  router,
  logger,
  corsOrigins,
  rateLimit: limites,
}: HttpAppOptions): Express {
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

  // /health, /docs y /openapi.json en la raíz: se atienden con las mismas rutas del módulo.
  app.use((req, _res, next) => {
    if (RUTAS_RAIZ.some((r) => req.path === r || req.path.startsWith(`${r}/`))) {
      req.url = `${API_PREFIX}${req.url}`;
    }
    next();
  });

  if (limites) {
    aplicarLimites(app, API_PREFIX, limites);
    aplicarLimites(app, LEGACY_API_PREFIX, limites);
  }

  app.use(API_PREFIX, router);
  app.use(
    LEGACY_API_PREFIX,
    (_req, res, next) => {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', `<${API_PREFIX}>; rel="successor-version"`);
      next();
    },
    router,
  );
  return app;
}
