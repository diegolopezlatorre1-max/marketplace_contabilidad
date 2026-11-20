import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { MockOrdersGateway } from '../../src/infrastructure/integration/orders/MockOrdersGateway';
import { MockPaymentsGateway } from '../../src/infrastructure/integration/payments/MockPaymentsGateway';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/v1/contabilidad';
const reloj = { now: () => new Date('2026-10-16T15:00:00Z') };
const ordenes = new MockOrdersGateway(reloj.now);
const pagos = new MockPaymentsGateway(reloj.now);

// Se crea al primer uso: el pool de pruebas se inicializa en el beforeAll de setup.ts.
let appCache: ReturnType<typeof createHttpApp> | undefined;
function app() {
  appCache ??= createHttpApp({
    router: createContabilidadModule({
      config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
      pool: testPool(),
      logger,
      overrides: { clock: reloj },
    }).router,
    logger,
    corsOrigins: [],
  });
  return appCache;
}

const sistema = (url: string, body: object) =>
  request(app())
    .post(BASE + url)
    .set('authorization', 'Bearer mock-sistema')
    .send(body);
const contador = {
  get: (url: string) =>
    request(app())
      .get(BASE + url)
      .set('authorization', 'Bearer mock-contador'),
  post: (url: string, body: object) =>
    request(app())
      .post(BASE + url)
      .set('authorization', 'Bearer mock-contador')
      .send(body),
};

async function orden(numeroOrden: string, valores: string[]) {
  const res = await sistema(
    '/eventos/orden-confirmada',
    ordenes.generarOrdenConfirmada({
      numeroOrden,
      vendedores: valores.map((_, i) => `V-${i + 1}`),
      valores,
      fecha: new Date('2026-10-05T15:00:00Z'),
    }),
  );
  expect(res.status).toBe(201);
}

async function pago(valor: string, referencia: string, ordenesPagadas?: string[]) {
  const res = await sistema(
    '/eventos/pago-recibido',
    pagos.generarPagoRecibido({
      valor,
      referencia,
      ...(ordenesPagadas ? { ordenes: ordenesPagadas } : {}),
    }),
  );
  expect(res.status).toBe(201);
  return res.body as { pagoId: string; estado: string; detalle?: string };
}

async function contar(tabla: string): Promise<number> {
  const { rows } = await testPool().query<{ n: string }>(
    `SELECT count(*) AS n FROM contabilidad.${tabla}`,
  );
  return Number(rows[0]?.n);
}

beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
});

describe('HU-CON-04 - conciliar pagos recibidos contra órdenes', () => {
  it('pago de 150.000 con órdenes de 100.000 + 50.000 se concilia automáticamente', async () => {
    await orden('ORD-1', ['100000.00']);
    await orden('ORD-2', ['30000.00', '20000.00']);
    const r = await pago('150000.00', 'PSE-1', ['ORD-1', 'ORD-2']);
    expect(r.estado).toBe('CONCILIADO');

    const [c] = (await contador.get('/conciliaciones?estado=CONCILIADA')).body;
    expect(c).toMatchObject({
      valorPago: '150000.00',
      valorAplicado: '150000.00',
      diferencia: '0.00',
    });
    expect(c.detalles).toEqual([
      { numeroOrden: 'ORD-1', valorOrden: '100000.00', valorAplicado: '100000.00' },
      { numeroOrden: 'ORD-2', valorOrden: '50000.00', valorAplicado: '50000.00' },
    ]);
    const outbox = await testPool().query(
      `SELECT payload FROM contabilidad.outbox WHERE tipo = 'contabilidad.conciliacion.cerrada'`,
    );
    expect(outbox.rows[0]?.payload).toMatchObject({
      referenciaPasarela: 'PSE-1',
      ordenes: ['ORD-1', 'ORD-2'],
    });
  });

  it('pago de 95.000 contra una orden de 100.000 -> diferencia -5.000, PENDIENTE y auditada', async () => {
    await orden('ORD-1', ['100000.00']);
    const { pagoId, estado } = await pago('95000.00', 'PSE-2');
    expect(estado).toBe('SIN_CONCILIAR');

    const res = await contador
      .post('/conciliaciones', { pagoId, ordenes: [{ numeroOrden: 'ORD-1' }] })
      .set('x-correlation-id', 'corr-hu04');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      estado: 'PENDIENTE',
      diferencia: '-5000.00',
      usuario: 'u-contador',
    });

    const auditoria = await testPool().query(
      `SELECT usuario, correlation_id FROM contabilidad.auditoria WHERE accion = 'CONCILIAR'`,
    );
    expect(auditoria.rows).toEqual([{ usuario: 'u-contador', correlation_id: 'corr-hu04' }]);
    const bandeja = (await contador.get('/pagos-recibidos?estado=PENDIENTE')).body;
    expect(bandeja).toEqual([expect.objectContaining({ id: pagoId, diferencia: '-5000.00' })]);
  });

  it('una orden se paga en dos partes y no admite más de su valor', async () => {
    await orden('ORD-1', ['100000.00']);
    const p1 = await pago('40000.00', 'PSE-A');
    const p2 = await pago('60000.00', 'PSE-B');
    const p3 = await pago('1000.00', 'PSE-C');
    const c1 = await contador.post('/conciliaciones', {
      pagoId: p1.pagoId,
      ordenes: [{ numeroOrden: 'ORD-1', valorAplicado: '40000.00' }],
    });
    const c2 = await contador.post('/conciliaciones', {
      pagoId: p2.pagoId,
      ordenes: [{ numeroOrden: 'ORD-1' }],
    });
    expect([c1.body.estado, c2.body.estado]).toEqual(['CONCILIADA', 'CONCILIADA']);
    const c3 = await contador.post('/conciliaciones', {
      pagoId: p3.pagoId,
      ordenes: [{ numeroOrden: 'ORD-1' }],
    });
    expect([c3.status, c3.body.code]).toEqual([422, 'APLICADO_EXCEDE_SALDO']);
  });

  it('dos conciliaciones simultáneas no aplican dos veces el saldo de la misma orden', async () => {
    await orden('ORD-1', ['100000.00']);
    const p1 = await pago('100000.00', 'PSE-X');
    const p2 = await pago('100000.00', 'PSE-Y');
    const respuestas = await Promise.all(
      [p1, p2].map((p) =>
        contador.post('/conciliaciones', { pagoId: p.pagoId, ordenes: [{ numeroOrden: 'ORD-1' }] }),
      ),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 422]);
    const { rows } = await testPool().query<{ total: string }>(
      `SELECT sum(valor_aplicado) AS total FROM contabilidad.conciliacion_detalle WHERE numero_orden = 'ORD-1'`,
    );
    expect(rows[0]?.total).toBe('100000.00');
  });

  it('la misma conciliación enviada dos veces a la vez queda registrada una sola vez', async () => {
    await orden('ORD-1', ['100000.00']);
    const { pagoId } = await pago('100000.00', 'PSE-Z');
    const body = { pagoId, ordenes: [{ numeroOrden: 'ORD-1', valorAplicado: '10.00' }] };
    const respuestas = await Promise.all([
      contador.post('/conciliaciones', body),
      contador.post('/conciliaciones', body),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await contar('conciliacion')).toBe(1);
  });

  it('evento repetido -> YA_PROCESADO; misma referencia con otro eventId -> 409', async () => {
    const evento = pagos.generarPagoRecibido({ referencia: 'PSE-R' });
    expect((await sistema('/eventos/pago-recibido', evento)).status).toBe(201);
    const repetido = await sistema('/eventos/pago-recibido', evento);
    expect([repetido.status, repetido.body.resultado]).toEqual([200, 'YA_PROCESADO']);
    const otro = await sistema('/eventos/pago-recibido', { ...evento, eventId: 'evt-otro' });
    expect([otro.status, otro.body.code]).toEqual([409, 'REFERENCIA_DUPLICADA']);
    expect(await contar('pago_recibido')).toBe(1);
  });

  it('si las órdenes informadas no existen, el pago queda SIN_CONCILIAR con el motivo', async () => {
    const r = await pago('5000.00', 'PSE-S', ['ORD-NO-EXISTE']);
    expect(r.estado).toBe('SIN_CONCILIAR');
    expect(r.detalle).toContain('ORD-NO-EXISTE');
    expect(await contar('conciliacion')).toBe(0);
  });

  it('importa un CSV: cada fila por separado, con conciliación automática', async () => {
    await orden('ORD-1', ['100000.00']);
    const csv = [
      'referencia,fecha,valor,ordenes',
      'CSV-1,2026-10-16,100000.00,ORD-1',
      'CSV-1,2026-10-16,5.00,',
      'CSV-3,16/10/2026,1,',
      'CSV-4,2026-10-16T09:00:00-05:00,2500.50,',
    ].join('\n');
    const res = await request(app())
      .post(`${BASE}/pagos-recibidos/importar`)
      .set('authorization', 'Bearer mock-contador')
      .set('content-type', 'text/csv')
      .send(csv);
    expect(res.status).toBe(200);
    expect(
      res.body.filas.map((f: { resultado: string; estado?: string }) => [f.resultado, f.estado]),
    ).toEqual([
      ['IMPORTADO', 'CONCILIADO'],
      ['DUPLICADO', undefined],
      ['ERROR', undefined],
      ['IMPORTADO', 'SIN_CONCILIAR'],
    ]);
    const { rows } = await testPool().query(
      `SELECT referencia_pasarela, origen, valor FROM contabilidad.pago_recibido ORDER BY referencia_pasarela`,
    );
    expect(rows).toEqual([
      { referencia_pasarela: 'CSV-1', origen: 'CSV', valor: '100000.00' },
      { referencia_pasarela: 'CSV-4', origen: 'CSV', valor: '2500.50' },
    ]);
  });

  it('la BD exige diferencia = pago - aplicado y aplicado <= valor de la orden', async () => {
    await orden('ORD-1', ['100000.00']);
    await pago('100000.00', 'PSE-DB', ['ORD-1']);
    await expect(
      testPool().query(`UPDATE contabilidad.conciliacion SET diferencia = diferencia + 1`),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      testPool().query(
        `UPDATE contabilidad.conciliacion_detalle SET valor_aplicado = valor_orden + 1`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('GET /conciliaciones/{id} y filtros por fecha', async () => {
    await orden('ORD-1', ['100000.00']);
    await pago('100000.00', 'PSE-F', ['ORD-1']);
    const [c] = (await contador.get('/conciliaciones')).body;
    expect((await contador.get(`/conciliaciones/${c.id}`)).body).toMatchObject({
      id: c.id,
      estado: 'CONCILIADA',
    });
    expect(
      (await contador.get('/conciliaciones?desde=2026-10-16&hasta=2026-10-16')).body,
    ).toHaveLength(1);
    expect((await contador.get('/conciliaciones?desde=2026-10-17')).body).toHaveLength(0);
    expect((await contador.get('/pagos-recibidos?hasta=2026-10-15')).body).toHaveLength(0);
  });
});
