import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/v1/contabilidad';
const reloj = { now: () => new Date('2026-11-10T15:00:00Z') };
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
const auditoria = (query = '', token = 'mock-admin') =>
  request(app()).get(`${BASE}/auditoria${query}`).set('authorization', `Bearer ${token}`);

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
  await post(
    '/eventos/orden-confirmada',
    'mock-sistema',
    ordenes.generarOrdenConfirmada({
      numeroOrden: 'ORD-1',
      vendedores: ['V-1'],
      valores: ['100000.00'],
      fecha: new Date('2026-10-05T14:00:00Z'),
    }),
  );
  await post('/pagos-vendedor', 'mock-contador', {
    vendedorId: 'V-1',
    valor: '40000.00',
    referencia: 'TRF-1',
  });
});

describe('HU-CON-11 - criterios de aceptación del F01', () => {
  it('1. filtra por entidad, usuario y rango de fechas', async () => {
    const todos = await auditoria();
    expect(todos.status).toBe(200);
    expect(todos.body.total).toBe(2);
    expect(todos.body.items.map((i: { entidad: string }) => i.entidad)).toEqual([
      'pago_vendedor',
      'venta_contable',
    ]);

    expect((await auditoria('?entidad=venta_contable')).body.total).toBe(1);
    expect((await auditoria('?usuario=u-contador')).body.items[0].entidad).toBe('pago_vendedor');

    // Mueve la venta al 9 de noviembre a las 23:30 de Colombia (10 de noviembre en UTC).
    await testPool().query(
      `UPDATE contabilidad.auditoria SET fecha = '2026-11-10T04:30:00Z' WHERE entidad = 'venta_contable'`,
    );
    const dia9 = await auditoria('?desde=2026-11-09&hasta=2026-11-09');
    expect(dia9.body.items.map((i: { entidad: string }) => i.entidad)).toEqual(['venta_contable']);
  });

  it('2. muestra los valores antes y después del cambio', async () => {
    const res = await auditoria('?entidad=pago_vendedor');
    expect(res.body.items[0]).toMatchObject({
      accion: 'REGISTRAR',
      usuario: 'u-contador',
      valoresAnteriores: {
        saldoAFavor: '0.00',
        cuentas: [{ periodo: '2026-10-Q1', saldoPendiente: '90000.00', estado: 'PENDIENTE' }],
      },
      valoresNuevos: {
        pago: { valor: '40000.00', aplicaciones: [{ saldoNuevo: '50000.00', estado: 'PARCIAL' }] },
      },
    });
  });

  it('3. solo es accesible para el administrador financiero', async () => {
    expect((await auditoria('', 'mock-contador')).status).toBe(403);
    expect((await auditoria('', 'mock-sistema')).status).toBe(403);
    expect((await auditoria('?entidad=otra')).status).toBe(400);
  });

  it('pagina los resultados', async () => {
    const res = await auditoria('?page=2&size=1');
    expect(res.body).toMatchObject({ page: 2, size: 1, total: 2 });
    expect(res.body.items.map((i: { entidad: string }) => i.entidad)).toEqual(['venta_contable']);
  });
});
