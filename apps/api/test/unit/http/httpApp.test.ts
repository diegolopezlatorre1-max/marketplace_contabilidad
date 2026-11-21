import { Router } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  API_PREFIX,
  createHttpApp,
  LEGACY_API_PREFIX,
  type RateLimitOptions,
} from '../../../src/infrastructure/http/express/createHttpApp';

const logger = pino({ level: 'silent' });

/** Router mínimo: responde la ruta pedida para comprobar a dónde llega cada petición. */
function routerEco(): Router {
  const router = Router();
  router.use((req, res) => {
    res.json({ ruta: req.path, base: req.baseUrl });
  });
  return router;
}

function app(rateLimit?: RateLimitOptions) {
  return createHttpApp({
    router: routerEco(),
    logger,
    corsOrigins: [],
    ...(rateLimit ? { rateLimit } : {}),
  });
}

describe('createHttpApp - rutas (GUIA_EQUIPO_6, sección 9)', () => {
  it('monta la API en /api/contabilidad', async () => {
    const res = await request(app()).get(`${API_PREFIX}/ventas`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ruta: '/ventas', base: '/api/contabilidad' });
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('atiende /health, /docs y /openapi.json en la raíz con las rutas del módulo', async () => {
    for (const [url, ruta] of [
      ['/health', '/health'],
      ['/docs/', '/docs/'],
      ['/docs/swagger-ui.css', '/docs/swagger-ui.css'],
      ['/openapi.json', '/openapi.json'],
    ] as const) {
      const res = await request(app()).get(url);
      expect(res.body).toEqual({ ruta, base: '/api/contabilidad' });
    }
  });

  it('no expone otras rutas del módulo en la raíz', async () => {
    expect((await request(app()).get('/ventas')).status).toBe(404);
    expect((await request(app()).get('/healthz')).status).toBe(404);
  });

  it('mantiene /api/v1/contabilidad como alias marcado como obsoleto', async () => {
    const res = await request(app()).get(`${LEGACY_API_PREFIX}/ventas`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ruta: '/ventas', base: '/api/v1/contabilidad' });
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain('</api/contabilidad>');
  });
});

describe('createHttpApp - límite de peticiones (GUIA_EQUIPO_6, sección 7)', () => {
  const limites: RateLimitOptions = { windowMs: 60_000, general: 2, eventos: 4, exportaciones: 1 };

  it('responde 429 problem+json al superar el límite general', async () => {
    const servidor = app(limites);
    for (let i = 0; i < 2; i++) {
      expect((await request(servidor).get(`${API_PREFIX}/ventas`)).status).toBe(200);
    }
    const res = await request(servidor).get(`${API_PREFIX}/ventas`);
    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 429, code: 'DEMASIADAS_PETICIONES' });
    expect(res.headers.ratelimit).toBeDefined();
  });

  it('los eventos y las exportaciones tienen su propio límite y /health no se limita', async () => {
    const servidor = app(limites);
    for (let i = 0; i < 4; i++) {
      expect((await request(servidor).post(`${API_PREFIX}/eventos/orden-confirmada`)).status).toBe(
        200,
      );
    }
    expect((await request(servidor).post(`${API_PREFIX}/eventos/orden-confirmada`)).status).toBe(
      429,
    );
    // Los eventos no consumen el límite general.
    expect((await request(servidor).get(`${API_PREFIX}/ventas`)).status).toBe(200);

    expect((await request(servidor).get(`${API_PREFIX}/exportaciones/excel`)).status).toBe(200);
    expect((await request(servidor).get(`${API_PREFIX}/exportaciones/excel`)).status).toBe(429);

    for (let i = 0; i < 5; i++) {
      expect((await request(servidor).get('/health')).status).toBe(200);
      expect((await request(servidor).get('/docs/swagger-ui.css')).status).toBe(200);
      expect((await request(servidor).get('/openapi.json')).status).toBe(200);
    }
  });
});
