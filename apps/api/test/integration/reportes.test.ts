import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/v1/contabilidad';
const reloj = { now: () => new Date('2026-10-31T20:00:00Z') };
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

/** Registra una orden de un vendedor; `instante` en UTC. Devuelve el id de la venta. */
async function vender(numeroOrden: string, valor: string, instante: string, vendedorId = 'V-1') {
  await request(app())
    .post(`${BASE}/eventos/orden-confirmada`)
    .set('authorization', 'Bearer mock-sistema')
    .send(
      ordenes.generarOrdenConfirmada({
        numeroOrden,
        vendedores: [vendedorId],
        valores: [valor],
        fecha: new Date(instante),
      }),
    );
  const { rows } = await testPool().query<{ id: string }>(
    `SELECT id FROM contabilidad.venta_contable WHERE numero_orden = $1`,
    [numeroOrden],
  );
  return rows[0]!.id;
}

const devolver = (ventaId: string, valor: string, fecha: string) =>
  request(app())
    .post(`${BASE}/ajustes`)
    .set('authorization', 'Bearer mock-contador')
    .send({ ventaId, tipo: 'DEVOLUCION', motivo: 'Devolución', valor, fecha });

const reporte = (q: string) =>
  request(app()).get(`${BASE}/reportes/ingresos${q}`).set('authorization', 'Bearer mock-contador');

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
});

describe('HU-CON-05 - criterios de aceptación del F01', () => {
  it('1. permite seleccionar un rango de fechas (inclusivo) y lo valida', async () => {
    await vender('ORD-30', '30000', '2026-09-30T15:00:00Z');
    await vender('ORD-01', '10000', '2026-10-01T15:00:00Z');
    await vender('ORD-15', '15000', '2026-10-15T15:00:00Z');
    await vender('ORD-16', '16000', '2026-10-16T15:00:00Z');

    const r = await reporte('?desde=2026-10-01&hasta=2026-10-15');
    expect(r.status).toBe(200);
    expect(r.body.porDia.map((d: { fecha: string }) => d.fecha)).toEqual([
      '2026-10-01',
      '2026-10-15',
    ]);
    expect(r.body.ventas.valorBruto).toBe('25000.00');
    expect((await reporte('?desde=2026-10-15&hasta=2026-10-01')).status).toBe(400);
    expect((await reporte('?desde=2026-10-01')).status).toBe(400);
  });

  it('2. muestra ventas, comisiones y valores netos', async () => {
    await vender('ORD-1', '100000', '2026-10-05T15:00:00Z');
    await vender('ORD-2', '50000', '2026-10-05T20:00:00Z', 'V-2');
    await vender('ORD-3', '30000', '2026-10-07T15:00:00Z');
    const r = await reporte('?desde=2026-10-01&hasta=2026-10-31');
    expect(r.body).toMatchObject({
      ventas: {
        cantidad: 3,
        valorBruto: '180000.00',
        comision: '18000.00',
        valorNeto: '162000.00',
      },
      totales: { valorBruto: '180000.00', comision: '18000.00', valorNeto: '162000.00' },
      control: { cuadra: true },
    });
    expect(r.body.porDia).toHaveLength(2);
    const v2 = await reporte('?desde=2026-10-01&hasta=2026-10-31&vendedorId=V-2');
    expect(v2.body.ventas).toMatchObject({ cantidad: 1, valorBruto: '50000.00' });
    const vacio = await reporte('?desde=2026-01-01&hasta=2026-01-31');
    expect(vacio.body).toMatchObject({
      ventas: { cantidad: 0, valorBruto: '0.00' },
      totales: { valorBruto: '0.00', comision: '0.00', valorNeto: '0.00' },
      porDia: [],
    });
  });

  it('3. el total coincide con las transacciones registradas (ajustes por su fecha)', async () => {
    const dentro = await vender('ORD-1', '100000', '2026-10-05T15:00:00Z');
    const antes = await vender('ORD-2', '80000', '2026-09-28T15:00:00Z');
    await vender('ORD-3', '40000.55', '2026-10-12T15:00:00Z', 'V-2');
    // Ajuste dentro del rango sobre una venta de fuera: sí resta.
    expect((await devolver(antes, '20000', '2026-10-03')).status).toBe(201);
    // Ajuste fuera del rango sobre una venta de dentro: no resta.
    expect((await devolver(dentro, '30000', '2026-10-20')).status).toBe(201);

    const r = await reporte('?desde=2026-10-01&hasta=2026-10-15');
    const sumas = await testPool().query<{
      bruto: string;
      comision: string;
      neto: string;
    }>(
      `SELECT
         (SELECT coalesce(sum(v.valor_bruto), 0) FROM contabilidad.venta_contable v
           WHERE v.fecha_contable BETWEEN '2026-10-01' AND '2026-10-15')
       - (SELECT coalesce(sum(a.valor), 0) FROM contabilidad.ajuste_contable a
           WHERE a.fecha_contable BETWEEN '2026-10-01' AND '2026-10-15') AS bruto,
         (SELECT coalesce(sum(c.valor_comision), 0) FROM contabilidad.comision c
           JOIN contabilidad.venta_contable v ON v.id = c.venta_id
           WHERE v.fecha_contable BETWEEN '2026-10-01' AND '2026-10-15')
       - (SELECT coalesce(sum(a.comision_revertida), 0) FROM contabilidad.ajuste_contable a
           WHERE a.fecha_contable BETWEEN '2026-10-01' AND '2026-10-15') AS comision,
         (SELECT coalesce(sum(c.valor_neto), 0) FROM contabilidad.comision c
           JOIN contabilidad.venta_contable v ON v.id = c.venta_id
           WHERE v.fecha_contable BETWEEN '2026-10-01' AND '2026-10-15')
       - (SELECT coalesce(sum(a.neto_revertido), 0) FROM contabilidad.ajuste_contable a
           WHERE a.fecha_contable BETWEEN '2026-10-01' AND '2026-10-15') AS neto`,
    );
    expect(r.body.totales).toEqual({
      valorBruto: sumas.rows[0]!.bruto,
      comision: sumas.rows[0]!.comision,
      valorNeto: sumas.rows[0]!.neto,
    });
    // 100.000 + 40.000,55 − 20.000 = 120.000,55
    expect(r.body.totales.valorBruto).toBe('120000.55');
    expect(r.body.ajustes).toMatchObject({ cantidad: 1, valorBruto: '20000.00' });
    expect(r.body.control.cuadra).toBe(true);
    const ajusteDia = r.body.porDia.find((d: { fecha: string }) => d.fecha === '2026-10-03');
    expect(ajusteDia).toMatchObject({ ventas: { cantidad: 0 }, ajustes: { cantidad: 1 } });
  });
});

describe('HU-CON-05 - días en hora de Colombia (America/Bogota)', () => {
  it('una venta a las 23:30 hora Colombia queda en ese día, aunque en UTC sea el siguiente', async () => {
    // 2026-10-10 23:30 en Bogotá = 2026-10-11 04:30 UTC.
    await vender('ORD-NOCHE', '100000', '2026-10-11T04:30:00Z');
    const { rows } = await testPool().query<{ fecha_contable: string; dia_utc: string }>(
      `SELECT fecha_contable, (fecha AT TIME ZONE 'UTC')::date::text AS dia_utc
         FROM contabilidad.venta_contable WHERE numero_orden = 'ORD-NOCHE'`,
    );
    expect(rows[0]).toEqual({ fecha_contable: '2026-10-10', dia_utc: '2026-10-11' });

    const dia10 = await reporte('?desde=2026-10-10&hasta=2026-10-10');
    expect(dia10.body.ventas.cantidad).toBe(1);
    expect(dia10.body.porDia).toEqual([expect.objectContaining({ fecha: '2026-10-10' })]);
    const dia11 = await reporte('?desde=2026-10-11&hasta=2026-10-11');
    expect(dia11.body.ventas.cantidad).toBe(0);
  });
});
