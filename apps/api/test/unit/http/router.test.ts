import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ObtenerEstadoModulo } from '../../../src/application/queries/ObtenerEstadoModulo';
import { InvalidValueError } from '../../../src/domain/shared';
import { createContabilidadRouter } from '../../../src/infrastructure/http/express/createContabilidadRouter';
import { errorHandler } from '../../../src/infrastructure/http/middlewares/errorHandler';
import { MockAuthContext } from '../../../src/infrastructure/integration/auth/MockAuthContext';

const logger = pino({ level: 'silent' });
const reloj = { now: () => new Date('2026-10-05T10:00:00Z') };

function app(dbOk = true) {
  const router = createContabilidadRouter({
    logger,
    auth: new MockAuthContext(),
    version: 'test',
    integrationMode: 'mock',
    queries: { obtenerEstado: new ObtenerEstadoModulo({ ping: async () => dbOk }, reloj) },
  });
  return express().use('/api/v1/contabilidad', router);
}

describe('Router del módulo', () => {
  it('GET /health responde 200 sin autenticación', async () => {
    const res = await request(app()).get('/api/v1/contabilidad/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      modulo: 'contabilidad',
      integrationMode: 'mock',
      checks: { baseDeDatos: 'ok' },
    });
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('GET /health responde 503 si la base de datos no está disponible', async () => {
    const res = await request(app(false)).get('/api/v1/contabilidad/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degradado');
  });

  it('propaga un correlation-id recibido', async () => {
    const res = await request(app())
      .get('/api/v1/contabilidad/health')
      .set('x-correlation-id', 'abc-123');
    expect(res.headers['x-correlation-id']).toBe('abc-123');
  });

  it('GET /me exige autenticación con formato problem+json', async () => {
    const res = await request(app()).get('/api/v1/contabilidad/me');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 401, code: 'NO_AUTENTICADO' });
    expect(res.body.correlationId).toBeTruthy();
  });

  it('GET /me rechaza tokens desconocidos', async () => {
    const res = await request(app())
      .get('/api/v1/contabilidad/me')
      .set('authorization', 'Bearer token-falso');
    expect(res.status).toBe(401);
  });

  it('GET /me devuelve el usuario y sus roles', async () => {
    const res = await request(app())
      .get('/api/v1/contabilidad/me')
      .set('authorization', 'Bearer mock-contador');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'u-contador',
      nombre: 'Contador de prueba',
      roles: ['CONTADOR'],
    });
  });

  it('responde 404 problem+json en rutas inexistentes', async () => {
    const res = await request(app())
      .get('/api/v1/contabilidad/no-existe')
      .set('authorization', 'Bearer mock-contador');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_ENCONTRADO');
  });

  it('publica el contrato OpenAPI', async () => {
    const res = await request(app()).get('/api/v1/contabilidad/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(Object.keys(res.body.paths)).toContain('/health');
  });
});

describe('errorHandler', () => {
  function appQueLanza(error: unknown) {
    return express()
      .use(express.json())
      .post('/x', () => {
        throw error;
      })
      .use(errorHandler(logger));
  }

  it('traduce errores de validación Zod a 400', async () => {
    const zerr = z.object({ a: z.string() }).safeParse({}).error;
    const res = await request(appQueLanza(zerr)).post('/x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION');
    expect(res.body.errors[0].path).toBe('a');
  });

  it('traduce valores inválidos del dominio a 400', async () => {
    const res = await request(appQueLanza(new InvalidValueError('Monto inválido'))).post('/x');
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Monto inválido');
  });

  it('traduce violaciones de unicidad de PostgreSQL a 409', async () => {
    const res = await request(appQueLanza({ code: '23505' })).post('/x');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICTO');
  });

  it('no expone detalles de errores inesperados', async () => {
    const res = await request(appQueLanza(new Error('secreto interno'))).post('/x');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secreto');
  });

  it('responde 400 ante JSON mal formado', async () => {
    const res = await request(appQueLanza(new Error('no debería llegar')))
      .post('/x')
      .set('content-type', 'application/json')
      .send('{malo');
    expect(res.status).toBe(400);
  });
});
