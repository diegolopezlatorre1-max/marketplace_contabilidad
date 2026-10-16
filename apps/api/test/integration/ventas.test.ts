import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const EVENTOS = '/api/v1/contabilidad/eventos/orden-confirmada';
const reloj = { now: () => new Date('2026-10-16T15:00:00Z') };
const ordenes = new MockOrdersGateway(reloj.now);

function crearApp() {
  const { router } = createContabilidadModule({
    config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
    pool: testPool(),
    logger,
    overrides: { clock: reloj },
  });
  return createHttpApp({ router, logger, corsOrigins: [] });
}

// Se crea al primer uso: el pool de pruebas se inicializa en el beforeAll de setup.ts.
let appCache: ReturnType<typeof crearApp> | undefined;
const app = () => (appCache ??= crearApp());
const enviar = (evento: object) =>
  request(app()).post(EVENTOS).set('authorization', 'Bearer mock-sistema').send(evento);

function orden(
  numeroOrden: string,
  vendedores: string[],
  valores: string[],
  fecha = '2026-10-05T14:58:00Z',
) {
  return ordenes.generarOrdenConfirmada({
    numeroOrden,
    vendedores,
    valores,
    fecha: new Date(fecha),
  });
}

async function contar(tabla: string): Promise<number> {
  const { rows } = await testPool().query<{ n: string }>(
    `SELECT count(*) AS n FROM contabilidad.${tabla}`,
  );
  return Number(rows[0]?.n);
}

async function cuentas() {
  const { rows } = await testPool().query(
    `SELECT vendedor_id, periodo, total_neto, valor_pagado, estado
       FROM contabilidad.cuenta_por_pagar ORDER BY vendedor_id, periodo`,
  );
  return rows;
}

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
});

describe('HU-CON-01 - registrar una venta confirmada', () => {
  it('registra venta, comisión, cuenta por pagar, inbox, auditoría y outbox', async () => {
    const evento = orden('ORD-1001', ['V-1'], ['100000.00']);
    const res = await enviar(evento).set('x-correlation-id', 'corr-hu01');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ eventId: evento.eventId, resultado: 'PROCESADO' });

    const venta = await testPool().query(
      `SELECT v.numero_orden, v.vendedor_id, v.fecha_contable, v.periodo, v.valor_bruto,
              c.porcentaje_aplicado, c.valor_comision, c.valor_neto
         FROM contabilidad.venta_contable v JOIN contabilidad.comision c ON c.venta_id = v.id`,
    );
    expect(venta.rows).toEqual([
      {
        numero_orden: 'ORD-1001',
        vendedor_id: 'V-1',
        fecha_contable: '2026-10-05',
        periodo: '2026-10-Q1',
        valor_bruto: '100000.00',
        porcentaje_aplicado: '10.0000',
        valor_comision: '10000.00',
        valor_neto: '90000.00',
      },
    ]);
    expect(await cuentas()).toEqual([
      {
        vendedor_id: 'V-1',
        periodo: '2026-10-Q1',
        total_neto: '90000.00',
        valor_pagado: '0.00',
        estado: 'PENDIENTE',
      },
    ]);
    expect(await contar('inbox')).toBe(1);

    const auditoria = await testPool().query(
      `SELECT entidad, accion, usuario, correlation_id FROM contabilidad.auditoria`,
    );
    expect(auditoria.rows).toEqual([
      {
        entidad: 'venta_contable',
        accion: 'REGISTRAR',
        usuario: 'sistema-marketplace',
        correlation_id: 'corr-hu01',
      },
    ]);
    const outbox = await testPool().query(`SELECT tipo, payload FROM contabilidad.outbox`);
    expect(outbox.rows).toEqual([
      {
        tipo: 'contabilidad.venta.registrada',
        payload: expect.objectContaining({ numeroOrden: 'ORD-1001', valorNeto: '90000.00' }),
      },
    ]);
  });

  it('un evento repetido responde YA_PROCESADO y no duplica', async () => {
    const evento = orden('ORD-1001', ['V-1'], ['100000.00']);
    expect((await enviar(evento)).status).toBe(201);
    const repetido = await enviar(evento);
    expect(repetido.status).toBe(200);
    expect(repetido.body.resultado).toBe('YA_PROCESADO');
    expect(await contar('venta_contable')).toBe(1);
    expect((await cuentas())[0]?.total_neto).toBe('90000.00');
  });

  it('una orden PENDIENTE se ignora y queda en evento_ignorado', async () => {
    const evento = ordenes.generarOrdenConfirmada({ estado: 'PENDIENTE' });
    const res = await enviar(evento);
    expect(res.status).toBe(200);
    expect(res.body.resultado).toBe('IGNORADO');
    expect(await contar('venta_contable')).toBe(0);
    expect(await contar('evento_ignorado')).toBe(1);
  });

  it('una orden multi-vendedor genera una venta y una cuenta por vendedor', async () => {
    const res = await enviar(orden('ORD-2001', ['V-1', 'V-2'], ['100000.00', '50000.00']));
    expect(res.status).toBe(201);
    expect(await contar('venta_contable')).toBe(2);
    expect((await cuentas()).map((c) => [c.vendedor_id, c.total_neto])).toEqual([
      ['V-1', '90000.00'],
      ['V-2', '45000.00'],
    ]);
  });

  it('netos de 90.000 y 45.000 del mismo vendedor en la quincena suman 135.000', async () => {
    await enviar(orden('ORD-1', ['V-1'], ['100000.00']));
    await enviar(orden('ORD-2', ['V-1'], ['50000.00'], '2026-10-10T15:00:00Z'));
    await enviar(orden('ORD-3', ['V-1'], ['20000.00'], '2026-10-16T15:00:00Z'));
    expect((await cuentas()).map((c) => [c.periodo, c.total_neto])).toEqual([
      ['2026-10-Q1', '135000.00'],
      ['2026-10-Q2', '18000.00'],
    ]);
  });

  it('dos envíos simultáneos del mismo evento crean un solo registro', async () => {
    const evento = orden('ORD-3001', ['V-1', 'V-2'], ['100000.00', '50000.00']);
    const respuestas = await Promise.all([enviar(evento), enviar(evento), enviar(evento)]);
    expect(respuestas.map((r) => r.body.resultado).sort()).toEqual([
      'PROCESADO',
      'YA_PROCESADO',
      'YA_PROCESADO',
    ]);
    expect(await contar('venta_contable')).toBe(2);
    expect(await contar('inbox')).toBe(1);
  });

  it('la misma orden con otro eventId responde 409 ORDEN_DUPLICADA, también en simultáneo', async () => {
    const a = orden('ORD-4001', ['V-1'], ['100000.00']);
    const b = { ...a, eventId: 'evt-otro' };
    const respuestas = await Promise.all([enviar(a), enviar(b)]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409)?.body.code).toBe('ORDEN_DUPLICADA');
    expect(await contar('venta_contable')).toBe(1);
  });

  it('órdenes simultáneas del mismo vendedor no pierden sumas en la cuenta', async () => {
    const eventos = Array.from({ length: 8 }, (_, i) => orden(`ORD-5${i}`, ['V-1'], ['10000.00']));
    const respuestas = await Promise.all(eventos.map(enviar));
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    expect((await cuentas())[0]?.total_neto).toBe('72000.00');
  });

  it('sin porcentaje vigente responde 422 y no deja registros', async () => {
    const res = await enviar(orden('ORD-6001', ['V-1'], ['100000.00'], '2025-12-31T15:00:00Z'));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COMISION_NO_CONFIGURADA');
    for (const tabla of ['venta_contable', 'comision', 'cuenta_por_pagar', 'inbox', 'outbox']) {
      expect(await contar(tabla), tabla).toBe(0);
    }
  });

  it('cambiar el porcentaje no altera las ventas ya registradas (HU-CON-02)', async () => {
    await enviar(orden('ORD-7001', ['V-1'], ['100000.00']));
    const put = await request(app())
      .put('/api/v1/contabilidad/comisiones/configuracion')
      .set('authorization', 'Bearer mock-admin')
      .send({ porcentaje: '12', vigenteDesde: '2026-10-06' });
    expect(put.status).toBe(200);
    await enviar(orden('ORD-7002', ['V-1'], ['100000.00'], '2026-10-06T15:00:00Z'));

    const { rows } = await testPool().query(
      `SELECT v.numero_orden, c.porcentaje_aplicado, c.valor_comision
         FROM contabilidad.venta_contable v JOIN contabilidad.comision c ON c.venta_id = v.id
        ORDER BY v.numero_orden`,
    );
    expect(rows).toEqual([
      { numero_orden: 'ORD-7001', porcentaje_aplicado: '10.0000', valor_comision: '10000.00' },
      { numero_orden: 'ORD-7002', porcentaje_aplicado: '12.0000', valor_comision: '12000.00' },
    ]);
  });

  it('la BD exige bruto = comisión + neto', async () => {
    await enviar(orden('ORD-8001', ['V-1'], ['100000.00']));
    await expect(
      testPool().query(`UPDATE contabilidad.comision SET valor_neto = valor_neto + 1`),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('GET /ventas', () => {
  it('lista con filtros de fecha y vendedor, y paginación', async () => {
    await enviar(orden('ORD-1', ['V-1', 'V-2'], ['100000.00', '50000.00']));
    await enviar(orden('ORD-2', ['V-1'], ['30000.00'], '2026-10-12T15:00:00Z'));
    const listar = (q: string) =>
      request(app())
        .get(`/api/v1/contabilidad/ventas${q}`)
        .set('authorization', 'Bearer mock-contador');

    const todas = await listar('');
    expect(todas.body.total).toBe(3);
    expect(todas.body.items[0]).toMatchObject({
      numeroOrden: 'ORD-2',
      fechaContable: '2026-10-12',
      porcentajeAplicado: '10.0000',
      comision: '3000.00',
      valorNeto: '27000.00',
    });
    expect((await listar('?vendedorId=V-1')).body.total).toBe(2);
    expect((await listar('?desde=2026-10-06&hasta=2026-10-31')).body.total).toBe(1);
    const pagina2 = await listar('?size=2&page=2');
    expect(pagina2.body).toMatchObject({ page: 2, size: 2, total: 3 });
    expect(pagina2.body.items).toHaveLength(1);
  });
});

describe('GET /periodos y GET /cuentas-por-pagar', () => {
  it('lista las cuentas por quincena con filtros', async () => {
    await enviar(orden('ORD-1', ['V-1', 'V-2'], ['100000.00', '50000.00']));
    await enviar(orden('ORD-2', ['V-1'], ['20000.00'], '2026-10-16T15:00:00Z'));
    const consultar = (url: string) =>
      request(app()).get(`/api/v1/contabilidad${url}`).set('authorization', 'Bearer mock-contador');

    expect((await consultar('/periodos')).body).toEqual({ periodos: ['2026-10-Q2', '2026-10-Q1'] });

    const todas = await consultar('/cuentas-por-pagar');
    expect(
      todas.body.map((c: { vendedorId: string; periodo: string }) => [c.periodo, c.vendedorId]),
    ).toEqual([
      ['2026-10-Q2', 'V-1'],
      ['2026-10-Q1', 'V-1'],
      ['2026-10-Q1', 'V-2'],
    ]);
    const q1v1 = await consultar('/cuentas-por-pagar?periodo=2026-10-Q1&vendedorId=V-1');
    expect(q1v1.body).toEqual([
      {
        vendedorId: 'V-1',
        periodo: '2026-10-Q1',
        totalNeto: '90000.00',
        valorPagado: '0.00',
        saldoPendiente: '90000.00',
        estado: 'PENDIENTE',
      },
    ]);
    expect((await consultar('/cuentas-por-pagar?estado=PAGADO')).body).toEqual([]);
    expect((await consultar('/ventas?periodo=2026-10-Q2')).body.total).toBe(1);
  });
});
