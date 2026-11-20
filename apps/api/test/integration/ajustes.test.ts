import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/v1/contabilidad';
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
const comoSistema = (url: string, body: object) =>
  request(app()).post(`${BASE}${url}`).set('authorization', 'Bearer mock-sistema').send(body);
const ajustar = (body: object) =>
  request(app()).post(`${BASE}/ajustes`).set('authorization', 'Bearer mock-contador').send(body);

/** Registra ORD-1 (V-1: 100.000, V-2: 50.000) el 5 de octubre y devuelve el id de la venta de V-1. */
async function ventaRegistrada(): Promise<string> {
  await comoSistema(
    '/eventos/orden-confirmada',
    ordenes.generarOrdenConfirmada({
      numeroOrden: 'ORD-1',
      vendedores: ['V-1', 'V-2'],
      valores: ['100000.00', '50000.00'],
      fecha: new Date('2026-10-05T14:00:00Z'),
    }),
  );
  const { rows } = await testPool().query<{ id: string }>(
    `SELECT id FROM contabilidad.venta_contable WHERE vendedor_id = 'V-1'`,
  );
  return rows[0]!.id;
}

async function cuenta(vendedorId: string) {
  const { rows } = await testPool().query<{ total_neto: string; saldo: string }>(
    `SELECT total_neto, total_neto - valor_pagado AS saldo
       FROM contabilidad.cuenta_por_pagar WHERE vendedor_id = $1`,
    [vendedorId],
  );
  return rows[0];
}

function evento(tipo: 'orden.cancelada' | 'orden.devuelta', eventId: string, lineas: object[]) {
  return {
    eventId,
    version: 1,
    ocurridoEn: '2026-10-08T10:00:00-05:00',
    tipo,
    numeroOrden: 'ORD-1',
    fecha: '2026-10-08T10:00:00-05:00',
    motivo: tipo === 'orden.cancelada' ? 'Cancelada por el comprador' : 'Producto defectuoso',
    lineas,
  };
}

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
});

describe('HU-CON-06 - criterios de aceptación del F01', () => {
  it('1. solo permite ajustes sobre órdenes existentes', async () => {
    const res = await ajustar({
      ventaId: '00000000-0000-4000-8000-000000000000',
      tipo: 'CANCELACION',
      motivo: 'No existe',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDEN_INEXISTENTE');
    const { rows } = await testPool().query(`SELECT 1 FROM contabilidad.ajuste_contable`);
    expect(rows).toHaveLength(0);
  });

  it('2. guarda motivo, fecha y valor (y el reverso con el % original)', async () => {
    const ventaId = await ventaRegistrada();
    const res = await ajustar({
      ventaId,
      tipo: 'DEVOLUCION',
      motivo: 'Producto defectuoso',
      valor: '30000.00',
      fecha: '2026-10-10',
    });
    expect(res.status).toBe(201);
    const { rows } = await testPool().query(
      `SELECT tipo, motivo, fecha_contable, periodo, valor, porcentaje_aplicado,
              comision_revertida, neto_revertido, saldo_a_favor, origen, registrado_por
         FROM contabilidad.ajuste_contable`,
    );
    expect(rows).toEqual([
      {
        tipo: 'DEVOLUCION',
        motivo: 'Producto defectuoso',
        fecha_contable: '2026-10-10',
        periodo: '2026-10-Q1',
        valor: '30000.00',
        porcentaje_aplicado: '10.0000',
        comision_revertida: '3000.00',
        neto_revertido: '27000.00',
        saldo_a_favor: '0.00',
        origen: 'MANUAL',
        registrado_por: 'u-contador',
      },
    ]);
    const auditoria = await testPool().query(
      `SELECT entidad, accion FROM contabilidad.auditoria WHERE entidad = 'ajuste_contable'`,
    );
    expect(auditoria.rows).toEqual([{ entidad: 'ajuste_contable', accion: 'REGISTRAR' }]);
    const outbox = await testPool().query(
      `SELECT tipo FROM contabilidad.outbox WHERE tipo = 'contabilidad.ajuste.registrado'`,
    );
    expect(outbox.rows).toHaveLength(1);
  });

  it('3. actualiza el saldo de la cuenta por pagar', async () => {
    const ventaId = await ventaRegistrada();
    expect(await cuenta('V-1')).toEqual({ total_neto: '90000.00', saldo: '90000.00' });
    await ajustar({ ventaId, tipo: 'DEVOLUCION', motivo: 'Parcial', valor: '30000.00' });
    expect(await cuenta('V-1')).toEqual({ total_neto: '63000.00', saldo: '63000.00' });
    const resumen = await request(app())
      .get(`${BASE}/cuentas-por-pagar/resumen`)
      .set('authorization', 'Bearer mock-contador');
    expect(resumen.body[0]).toMatchObject({ vendedorId: 'V-1', saldoPendiente: '63000.00' });
  });
});

describe('HU-CON-06 - reglas D-07 y eventos', () => {
  it('devolución parcial y luego cancelación cuadran al centavo con la venta', async () => {
    const ventaId = await ventaRegistrada();
    await ajustar({ ventaId, tipo: 'DEVOLUCION', motivo: 'Parcial', valor: '33333.33' });
    const excede = await ajustar({ ventaId, tipo: 'DEVOLUCION', motivo: 'x', valor: '66666.68' });
    expect(excede.status).toBe(422);
    await ajustar({ ventaId, tipo: 'CANCELACION', motivo: 'Resto' });
    const { rows } = await testPool().query(
      `SELECT sum(valor) AS valor, sum(comision_revertida) AS comision, sum(neto_revertido) AS neto
         FROM contabilidad.ajuste_contable WHERE venta_id = $1`,
      [ventaId],
    );
    expect(rows[0]).toEqual({ valor: '100000.00', comision: '10000.00', neto: '90000.00' });
    expect(await cuenta('V-1')).toEqual({ total_neto: '0.00', saldo: '0.00' });
  });

  it('la BD exige valor = comisión revertida + neto revertido', async () => {
    const ventaId = await ventaRegistrada();
    await ajustar({ ventaId, tipo: 'DEVOLUCION', motivo: 'x', valor: '1000.00' });
    await expect(
      testPool().query(
        `UPDATE contabilidad.ajuste_contable SET neto_revertido = neto_revertido + 1`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('ajustes simultáneos sobre la misma venta no superan su valor bruto', async () => {
    const ventaId = await ventaRegistrada();
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () =>
        ajustar({ ventaId, tipo: 'DEVOLUCION', motivo: 'Simultáneo', valor: '30000.00' }),
      ),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 201, 201, 422, 422]);
    expect(await cuenta('V-1')).toEqual({ total_neto: '9000.00', saldo: '9000.00' });
  });

  it('orden.cancelada es idempotente y ajusta a cada vendedor', async () => {
    await ventaRegistrada();
    const cancelada = evento('orden.cancelada', 'evt-cancel', [
      { vendedorId: 'V-1' },
      { vendedorId: 'V-2' },
    ]);
    const respuestas = await Promise.all([
      comoSistema('/eventos/orden-cancelada', cancelada),
      comoSistema('/eventos/orden-cancelada', cancelada),
    ]);
    expect(respuestas.map((r) => r.body.resultado).sort()).toEqual(['PROCESADO', 'YA_PROCESADO']);
    const { rows } = await testPool().query(
      `SELECT count(*)::int AS n FROM contabilidad.ajuste_contable WHERE origen = 'EVENTO'`,
    );
    expect(rows[0].n).toBe(2);
    expect(await cuenta('V-2')).toEqual({ total_neto: '0.00', saldo: '0.00' });
  });

  it('orden.devuelta parcial y una orden nunca registrada (IGNORADO)', async () => {
    await ventaRegistrada();
    const devuelta = await comoSistema(
      '/eventos/orden-devuelta',
      evento('orden.devuelta', 'evt-dev', [{ vendedorId: 'V-2', valorDevuelto: '20000.00' }]),
    );
    expect(devuelta.status).toBe(201);
    expect(await cuenta('V-2')).toEqual({ total_neto: '27000.00', saldo: '27000.00' });

    const desconocida = await comoSistema('/eventos/orden-cancelada', {
      ...evento('orden.cancelada', 'evt-otra', [{ vendedorId: 'V-1' }]),
      numeroOrden: 'ORD-NUNCA',
    });
    expect(desconocida.status).toBe(200);
    expect(desconocida.body.resultado).toBe('IGNORADO');
    const ignorados = await testPool().query(
      `SELECT count(*)::int AS n FROM contabilidad.evento_ignorado`,
    );
    expect(ignorados.rows[0].n).toBe(1);
  });

  it('GET /ajustes filtra por fecha del ajuste', async () => {
    const ventaId = await ventaRegistrada();
    await ajustar({
      ventaId,
      tipo: 'DEVOLUCION',
      motivo: 'a',
      valor: '1000.00',
      fecha: '2026-10-06',
    });
    await ajustar({
      ventaId,
      tipo: 'DEVOLUCION',
      motivo: 'b',
      valor: '1000.00',
      fecha: '2026-10-12',
    });
    const res = await request(app())
      .get(`${BASE}/ajustes?desde=2026-10-10&hasta=2026-10-31`)
      .set('authorization', 'Bearer mock-contador');
    expect(res.body).toMatchObject({
      total: 1,
      items: [{ motivo: 'b', fechaContable: '2026-10-12' }],
    });
  });
});
