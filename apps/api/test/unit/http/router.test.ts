import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfigurarComisionUseCase } from '../../../src/application/commands/ConfigurarComisionUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import type { ConfiguracionComisionRepository } from '../../../src/application/ports/out/ConfiguracionComisionRepository';
import type { UnitOfWork } from '../../../src/application/ports/out/UnitOfWork';
import { ListarVentasQuery } from '../../../src/application/queries/ListarVentasQuery';
import { ObtenerComisionVigenteQuery } from '../../../src/application/queries/ObtenerComisionVigenteQuery';
import { ObtenerEstadoModulo } from '../../../src/application/queries/ObtenerEstadoModulo';
import { InvalidValueError } from '../../../src/domain/shared';
import { createContabilidadRouter } from '../../../src/infrastructure/http/express/createContabilidadRouter';
import { errorHandler } from '../../../src/infrastructure/http/middlewares/errorHandler';
import { MockAuthContext } from '../../../src/infrastructure/integration/auth/MockAuthContext';
import { comisionGlobal, crearBaseEnMemoria } from '../application/enMemoria';

const logger = pino({ level: 'silent' });
const reloj = { now: () => new Date('2026-10-05T10:00:00Z') };

// Sin configuraciones: las pruebas de este archivo solo cubren la capa HTTP.
const repoVacio = {
  vigenteEn: async () => null,
  historial: async () => [],
} as unknown as ConfiguracionComisionRepository;
const uowQueFalla: UnitOfWork = {
  run: async () => {
    throw Object.assign(new Error('solapada'), { code: '23P01' });
  },
};

function app(dbOk = true) {
  // Ventas sobre una base en memoria con comisión GLOBAL del 10 %.
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  const router = createContabilidadRouter({
    logger,
    auth: new MockAuthContext(),
    version: 'test',
    integrationMode: 'mock',
    queries: {
      obtenerEstado: new ObtenerEstadoModulo({ ping: async () => dbOk }, reloj),
      obtenerComision: new ObtenerComisionVigenteQuery(repoVacio, reloj),
      listarVentas: new ListarVentasQuery(base.repos.ventas),
    },
    commands: {
      configurarComision: new ConfigurarComisionUseCase(uowQueFalla, reloj),
      registrarVenta: new RegistrarVentaConfirmadaUseCase(base.uow, reloj),
    },
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
    expect(Object.keys(res.body.paths)).toContain('/comisiones/configuracion');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/eventos/orden-confirmada', '/ventas']),
    );
  });
});

describe('Rutas de comisión', () => {
  const URL = '/api/v1/contabilidad/comisiones/configuracion';
  const valido = { porcentaje: '12.5', vigenteDesde: '2026-10-16' };

  it('GET exige autenticación', async () => {
    expect((await request(app()).get(URL)).status).toBe(401);
  });

  it('GET responde al contador aunque no haya configuración', async () => {
    const res = await request(app()).get(URL).set('authorization', 'Bearer mock-contador');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fecha: '2026-10-05', vigente: null, historial: [] });
  });

  it('GET rechaza una fecha mal formada', async () => {
    const res = await request(app())
      .get(`${URL}?fecha=16-10-2026`)
      .set('authorization', 'Bearer mock-contador');
    expect(res.status).toBe(400);
  });

  it('PUT es exclusivo del ADMIN_FINANCIERO', async () => {
    const res = await request(app())
      .put(URL)
      .set('authorization', 'Bearer mock-contador')
      .send(valido);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_AUTORIZADO');
  });

  it('PUT valida el cuerpo', async () => {
    for (const body of [
      {},
      { ...valido, porcentaje: '101' },
      { ...valido, porcentaje: '10.12345' },
      { ...valido, porcentaje: 12 },
      { ...valido, vigenteDesde: '2026-02-30' },
    ]) {
      const res = await request(app())
        .put(URL)
        .set('authorization', 'Bearer mock-admin')
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('PUT responde 409 si la BD detecta vigencias solapadas', async () => {
    const res = await request(app())
      .put(URL)
      .set('authorization', 'Bearer mock-admin')
      .send(valido);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICTO');
  });
});

describe('Rutas de ventas', () => {
  const EVENTOS = '/api/v1/contabilidad/eventos/orden-confirmada';
  const evento = {
    eventId: 'evt-001',
    version: 1,
    ocurridoEn: '2026-10-05T10:00:00-05:00',
    tipo: 'orden.confirmada',
    numeroOrden: 'ORD-1001',
    fecha: '2026-10-05T09:58:00-05:00',
    estado: 'CONFIRMADA',
    moneda: 'COP',
    lineas: [{ vendedorId: 'V-1', valorBruto: '100000.00' }],
  };

  it('POST /eventos/orden-confirmada es exclusivo del rol SISTEMA', async () => {
    const res = await request(app())
      .post(EVENTOS)
      .set('authorization', 'Bearer mock-contador')
      .send(evento);
    expect(res.status).toBe(403);
  });

  it('valida el evento contra el contrato v1', async () => {
    for (const body of [
      { ...evento, lineas: [] },
      { ...evento, version: 2 },
      { ...evento, lineas: [{ vendedorId: 'V-1', valorBruto: 100000 }] },
      { ...evento, lineas: [evento.lineas[0], evento.lineas[0]] },
    ]) {
      const res = await request(app())
        .post(EVENTOS)
        .set('authorization', 'Bearer mock-sistema')
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('responde 201 PROCESADO, luego 200 YA_PROCESADO, y lista la venta', async () => {
    const servidor = app();
    const primero = await request(servidor)
      .post(EVENTOS)
      .set('authorization', 'Bearer mock-sistema')
      .send(evento);
    expect(primero.status).toBe(201);
    expect(primero.body).toEqual({ eventId: 'evt-001', resultado: 'PROCESADO' });

    const repetido = await request(servidor)
      .post(EVENTOS)
      .set('authorization', 'Bearer mock-sistema')
      .send(evento);
    expect(repetido.status).toBe(200);
    expect(repetido.body.resultado).toBe('YA_PROCESADO');

    const ventas = await request(servidor)
      .get('/api/v1/contabilidad/ventas?vendedorId=V-1')
      .set('authorization', 'Bearer mock-contador');
    expect(ventas.status).toBe(200);
    expect(ventas.body).toMatchObject({ page: 1, size: 50, total: 1 });
    expect(ventas.body.items[0]).toMatchObject({ numeroOrden: 'ORD-1001', valorNeto: '90000.00' });
  });

  it('responde 200 IGNORADO para órdenes no confirmadas', async () => {
    const res = await request(app())
      .post(EVENTOS)
      .set('authorization', 'Bearer mock-sistema')
      .send({ ...evento, estado: 'PENDIENTE' });
    expect(res.status).toBe(200);
    expect(res.body.resultado).toBe('IGNORADO');
  });

  it('GET /ventas valida filtros y rol', async () => {
    const malFiltro = await request(app())
      .get('/api/v1/contabilidad/ventas?desde=05-10-2026')
      .set('authorization', 'Bearer mock-contador');
    expect(malFiltro.status).toBe(400);
    const sistema = await request(app())
      .get('/api/v1/contabilidad/ventas')
      .set('authorization', 'Bearer mock-sistema');
    expect(sistema.status).toBe(403);
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
