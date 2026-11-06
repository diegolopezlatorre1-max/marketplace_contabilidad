import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/v1/contabilidad';
const reloj = { now: () => new Date('2026-11-25T15:00:00Z') };
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

let appCache: ReturnType<typeof crearApp> | undefined;
const app = () => (appCache ??= crearApp());
const post = (url: string, token: string, body: object) =>
  request(app()).post(`${BASE}${url}`).set('authorization', `Bearer ${token}`).send(body);
const estado = (query = '') =>
  request(app())
    .get(`${BASE}/vendedores/V-1/estado${query}`)
    .set('authorization', 'Bearer mock-contador');

async function venta(numeroOrden: string, valor: string, fecha: string) {
  const res = await post(
    '/eventos/orden-confirmada',
    'mock-sistema',
    ordenes.generarOrdenConfirmada({
      numeroOrden,
      vendedores: ['V-1'],
      valores: [valor],
      fecha: new Date(fecha),
    }),
  );
  expect(res.status).toBe(201);
}

async function ventaId(numeroOrden: string): Promise<string> {
  const { rows } = await testPool().query<{ id: string }>(
    `SELECT id FROM contabilidad.venta_contable WHERE numero_orden = $1`,
    [numeroOrden],
  );
  return rows[0]!.id;
}

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
  // Octubre: 100.000 (Q1) y 50.000 (Q2). Noviembre: 200.000 (Q1).
  await venta('ORD-1', '100000.00', '2026-10-05T14:00:00Z');
  await venta('ORD-2', '50000.00', '2026-10-20T14:00:00Z');
  await venta('ORD-3', '200000.00', '2026-11-03T14:00:00Z');
});

describe('HU-CON-07 - criterios de aceptación del F01', () => {
  it('1 y 2. consulta por vendedor: total vendido, comisión, pagado y pendiente', async () => {
    await post('/pagos-vendedor', 'mock-contador', {
      vendedorId: 'V-1',
      valor: '100000.00',
      referencia: 'TRF-1',
    });
    const res = await estado();
    expect(res.status).toBe(200);
    expect(res.body.totales).toMatchObject({
      ventas: 3,
      vendido: '350000.00',
      comision: '35000.00',
      pagado: '100000.00',
      pendiente: '215000.00',
    });
    expect(res.body.periodos.map((p: { estado: string }) => p.estado)).toEqual([
      'PAGADO',
      'PARCIAL',
      'PENDIENTE',
    ]);
  });

  it('3. vendedor con movimientos en dos meses: al filtrar un mes solo aparece ese mes', async () => {
    const res = await estado('?desde=2026-11-Q1&hasta=2026-11-Q2');
    expect(res.body.periodos.map((p: { periodo: string }) => p.periodo)).toEqual(['2026-11-Q1']);
    expect(res.body.totales).toMatchObject({
      ventas: 1,
      vendido: '200000.00',
      pendiente: '180000.00',
    });
  });

  it('regla de control: vendido − comisión − ajustes = pagado + pendiente, con saldo a favor', async () => {
    await post('/ajustes', 'mock-contador', {
      ventaId: await ventaId('ORD-2'),
      tipo: 'DEVOLUCION',
      motivo: 'Devolución',
      valor: '20000.00',
    });
    await post('/pagos-vendedor', 'mock-contador', {
      vendedorId: 'V-1',
      valor: '90000.00',
      referencia: 'TRF-1',
    });
    await post('/ajustes', 'mock-contador', {
      ventaId: await ventaId('ORD-1'),
      tipo: 'CANCELACION',
      motivo: 'Cancelada tras el pago',
    });

    const res = await estado();
    expect(res.body.totales.ajustes).toEqual({
      valor: '120000.00',
      comisionRevertida: '12000.00',
      netoRevertido: '108000.00',
      descontadoDelSaldo: '18000.00',
      saldoAFavor: '90000.00',
    });
    expect(res.body.saldoAFavorDisponible).toBe('90000.00');
    expect(res.body.control).toMatchObject({
      cuadra: true,
      generado: '297000.00',
      liquidado: '297000.00',
    });

    // Cada quincena también cuadra por separado.
    for (const q of ['2026-10-Q1', '2026-10-Q2', '2026-11-Q1']) {
      expect((await estado(`?desde=${q}&hasta=${q}`)).body.control.cuadra, q).toBe(true);
    }
  });
});
