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
const comoSistema = (url: string, body: object) =>
  request(app()).post(`${BASE}${url}`).set('authorization', 'Bearer mock-sistema').send(body);
const comoContador = (url: string, body: object) =>
  request(app()).post(`${BASE}${url}`).set('authorization', 'Bearer mock-contador').send(body);
const pagar = (body: object) =>
  comoContador('/pagos-vendedor', { vendedorId: 'V-1', referencia: 'TRF-1', ...body });

/** Registra una venta de V-1 (comisión 10 %) en la fecha indicada. */
async function venta(numeroOrden: string, valor: string, fecha: string) {
  const res = await comoSistema(
    '/eventos/orden-confirmada',
    ordenes.generarOrdenConfirmada({
      numeroOrden,
      vendedores: ['V-1'],
      valores: [valor],
      fecha: new Date(fecha),
    }),
  );
  expect(res.status).toBe(201);
}

async function cuentas() {
  const { rows } = await testPool().query<{
    periodo: string;
    valor_pagado: string;
    saldo: string;
    estado: string;
  }>(
    `SELECT periodo, valor_pagado, total_neto - valor_pagado AS saldo, estado
       FROM contabilidad.cuenta_por_pagar WHERE vendedor_id = 'V-1' ORDER BY periodo`,
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
  // Netos de 90.000 (2026-10-Q1) y 45.000 (2026-10-Q2): el ejemplo del docx.
  await venta('ORD-1', '100000.00', '2026-10-05T14:00:00Z');
  await venta('ORD-2', '50000.00', '2026-10-20T14:00:00Z');
});

describe('HU-CON-10 - criterios de aceptación del F01', () => {
  it('1. registra fecha, valor, referencia y soporte del pago', async () => {
    const res = await pagar({
      valor: '90000.00',
      soporte: 'Comprobante 0001',
      fecha: '2026-11-09',
    });
    expect(res.status).toBe(201);
    const { rows } = await testPool().query(
      `SELECT vendedor_id, fecha_contable, valor, referencia, soporte, registrado_por
         FROM contabilidad.pago_vendedor`,
    );
    expect(rows).toEqual([
      {
        vendedor_id: 'V-1',
        fecha_contable: '2026-11-09',
        valor: '90000.00',
        referencia: 'TRF-1',
        soporte: 'Comprobante 0001',
        registrado_por: 'u-contador',
      },
    ]);
    const auditoria = await testPool().query(
      `SELECT accion FROM contabilidad.auditoria WHERE entidad = 'pago_vendedor'`,
    );
    expect(auditoria.rows).toEqual([{ accion: 'REGISTRAR' }]);
    const outbox = await testPool().query(
      `SELECT tipo FROM contabilidad.outbox WHERE tipo = 'contabilidad.pago-vendedor.registrado'`,
    );
    expect(outbox.rows).toHaveLength(1);
  });

  it('2. aplica el pago a las cuentas pendientes más antiguas (FIFO por periodo)', async () => {
    await pagar({ valor: '100000.00' });
    expect(await cuentas()).toEqual([
      { periodo: '2026-10-Q1', valor_pagado: '90000.00', saldo: '0.00', estado: 'PAGADO' },
      { periodo: '2026-10-Q2', valor_pagado: '10000.00', saldo: '35000.00', estado: 'PARCIAL' },
    ]);
    const { rows } = await testPool().query(
      `SELECT periodo, valor_aplicado, saldo_nuevo, estado
         FROM contabilidad.pago_vendedor_detalle ORDER BY periodo`,
    );
    expect(rows).toEqual([
      { periodo: '2026-10-Q1', valor_aplicado: '90000.00', saldo_nuevo: '0.00', estado: 'PAGADO' },
      {
        periodo: '2026-10-Q2',
        valor_aplicado: '10000.00',
        saldo_nuevo: '35000.00',
        estado: 'PARCIAL',
      },
    ]);
  });

  it('3. docx: un pago de 90.000 deja la cuenta pagada y el saldo pendiente en 45.000', async () => {
    await pagar({ valor: '90000.00' });
    expect(await cuentas()).toEqual([
      { periodo: '2026-10-Q1', valor_pagado: '90000.00', saldo: '0.00', estado: 'PAGADO' },
      { periodo: '2026-10-Q2', valor_pagado: '0.00', saldo: '45000.00', estado: 'PENDIENTE' },
    ]);
    const resumen = await request(app())
      .get(`${BASE}/cuentas-por-pagar/resumen`)
      .set('authorization', 'Bearer mock-contador');
    expect(resumen.body[0]).toMatchObject({ vendedorId: 'V-1', saldoPendiente: '45000.00' });
  });
});

describe('HU-CON-10 - reglas D-06', () => {
  it('no permite pagar más del saldo y no deja rastros', async () => {
    const res = await pagar({ valor: '135000.01' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PAGO_EXCEDE_SALDO');
    expect((await testPool().query('SELECT 1 FROM contabilidad.pago_vendedor')).rows).toHaveLength(
      0,
    );
    expect((await cuentas()).every((c) => c.valor_pagado === '0.00')).toBe(true);
  });

  it('la referencia no se repite para el mismo vendedor', async () => {
    expect((await pagar({ valor: '1000.00' })).status).toBe(201);
    const repetido = await pagar({ valor: '1000.00' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.code).toBe('REFERENCIA_DUPLICADA');
  });

  it('descuenta el saldo a favor que dejó una cancelación sobre una cuenta pagada', async () => {
    await pagar({ valor: '90000.00' });
    const { rows } = await testPool().query<{ id: string }>(
      `SELECT id FROM contabilidad.venta_contable WHERE numero_orden = 'ORD-1'`,
    );
    const ajuste = await comoContador('/ajustes', {
      ventaId: rows[0]!.id,
      tipo: 'DEVOLUCION',
      motivo: 'Devolución tras el pago',
      valor: '20000.00',
    });
    expect(ajuste.body.saldoAFavor).toBe('18000.00');

    // Debe 45.000 y hay 18.000 a favor: se transfieren 27.000 y la cuenta queda pagada.
    const pago = await pagar({ referencia: 'TRF-2', valor: '27000.00' });
    expect(pago.status).toBe(201);
    expect(pago.body.saldoAFavorAplicado).toBe('18000.00');
    expect((await cuentas())[1]).toMatchObject({ saldo: '0.00', estado: 'PAGADO' });
  });

  it('pagos simultáneos al mismo vendedor no superan su saldo', async () => {
    const respuestas = await Promise.all(
      ['A', 'B', 'C'].map((r) => pagar({ referencia: r, valor: '50000.00' })),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 201, 422]);
    const pagado = await testPool().query<{ total: string }>(
      `SELECT sum(valor_pagado) AS total FROM contabilidad.cuenta_por_pagar`,
    );
    expect(pagado.rows[0]!.total).toBe('100000.00');
  });

  it('GET /pagos-vendedor filtra por vendedor y fecha', async () => {
    await pagar({ referencia: 'A', valor: '1000.00', fecha: '2026-11-02' });
    await pagar({ referencia: 'B', valor: '1000.00', fecha: '2026-11-09' });
    const res = await request(app())
      .get(`${BASE}/pagos-vendedor?vendedorId=V-1&desde=2026-11-05`)
      .set('authorization', 'Bearer mock-admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 1,
      items: [
        { referencia: 'B', aplicaciones: [{ periodo: '2026-10-Q1', valorAplicado: '1000.00' }] },
      ],
    });
  });
});
