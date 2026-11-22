import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { PgEscrowRepository } from '../../src/infrastructure/persistence/postgres/PgEscrowRepository';
import { liberarEscrow, limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const BASE = '/api/contabilidad';

function app() {
  const { router } = createContabilidadModule({
    config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
    pool: testPool(),
    logger,
  });
  return createHttpApp({ router, logger, corsOrigins: [] });
}

function post(url: string, token: string, body?: object) {
  const r = request(app()).post(`${BASE}${url}`).set('authorization', `Bearer ${token}`);
  return body ? r.send(body) : r;
}

const ORDENES = [
  {
    eventId: 'evt-1',
    numeroOrden: 'ORD-1',
    fecha: '2026-10-05T09:00:00-05:00',
    lineas: [
      { vendedorId: 'V-1', valorBruto: '100000.00' },
      { vendedorId: 'V-2', valorBruto: '30000.00' },
    ],
  },
  {
    eventId: 'evt-2',
    numeroOrden: 'ORD-2',
    fecha: '2026-10-20T09:00:00-05:00',
    lineas: [{ vendedorId: 'V-1', valorBruto: '50000.00' }],
  },
];

/** Comisión 10 %. V-1: ORD-1 (neto 90.000, Q1) y ORD-2 (neto 45.000, Q2); V-2: ORD-1 (27.000). */
beforeEach(async () => {
  await limpiarTablas();
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
  for (const o of ORDENES) {
    const res = await post('/eventos/orden-confirmada', 'mock-sistema', {
      ...o,
      version: 1,
      ocurridoEn: o.fecha,
      tipo: 'orden.confirmada',
      estado: 'CONFIRMADA',
      moneda: 'COP',
    });
    expect(res.status).toBe(201);
  }
});

describe('Escrow contra PostgreSQL', () => {
  it('guarda el estado, lo audita y retiene el neto del pedido por vendedor y quincena', async () => {
    expect((await post('/escrow/marcar-entrega/ORD-1', 'mock-sistema')).status).toBe(200);

    const repo = new PgEscrowRepository(testPool());
    const ahora = new Date();
    const v1 = await repo.netoRetenidoPorPeriodo('V-1', ahora);
    expect(v1.get('2026-10-Q1')?.toString()).toBe('90000.00');
    // ORD-2 no tiene entrega (ni registro de escrow): también retiene.
    expect(v1.get('2026-10-Q2')?.toString()).toBe('45000.00');
    // El mismo pedido retiene también la línea de V-2.
    const v2 = await repo.netoRetenidoPorPeriodo('V-2', ahora);
    expect(v2.get('2026-10-Q1')?.toString()).toBe('27000.00');
    // Pasadas las 72 h ORD-1 ya no retiene; ORD-2 sigue sin entrega.
    const despues = new Date(ahora.getTime() + 73 * 3_600_000);
    const v1Despues = await repo.netoRetenidoPorPeriodo('V-1', despues);
    expect([...v1Despues.keys()]).toEqual(['2026-10-Q2']);

    const { rows } = await testPool().query(
      `SELECT accion, usuario FROM contabilidad.auditoria WHERE entidad = 'escrow_pedido'`,
    );
    expect(rows).toEqual([{ accion: 'MARCAR_ENTREGA', usuario: 'servicio:marketplace' }]);
  });

  it('sin entrega no se le paga nada al vendedor', async () => {
    const res = await post('/pagos-vendedor', 'mock-admin', {
      vendedorId: 'V-1',
      valor: '0.01',
      referencia: 'TRF-0',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SALDO_RETENIDO_ESCROW');
  });

  it('el pago respeta el bloqueo por PQR y se libera cuando el ADMIN desbloquea', async () => {
    await liberarEscrow();
    expect((await post('/escrow/bloquear/ORD-2', 'mock-sistema', { motivo: 'PQR-9' })).status).toBe(
      200,
    );

    const pagar = (valor: string, referencia: string) =>
      post('/pagos-vendedor', 'mock-admin', { vendedorId: 'V-1', valor, referencia });
    const retenido = await pagar('135000.00', 'TRF-1');
    expect(retenido.status).toBe(422);
    expect(retenido.body.code).toBe('SALDO_RETENIDO_ESCROW');
    expect((await pagar('90000.00', 'TRF-2')).status).toBe(201);

    const desbloqueo = await post('/escrow/desbloquear/ORD-2', 'mock-admin', {
      motivo: 'PQR-9 resuelta a favor del vendedor',
    });
    expect(desbloqueo.status).toBe(200);
    const liberado = await pagar('45000.00', 'TRF-3');
    expect(liberado.status).toBe(201);
    expect(liberado.body.aplicaciones).toMatchObject([{ periodo: '2026-10-Q2', estado: 'PAGADO' }]);

    const { rows } = await testPool().query(
      `SELECT bloqueado, motivo_bloqueo FROM contabilidad.escrow_pedido WHERE pedido_id = 'ORD-2'`,
    );
    expect(rows).toEqual([{ bloqueado: false, motivo_bloqueo: null }]);

    const auditoria = await testPool().query(
      `SELECT usuario, valores_nuevos->>'motivoOperacion' AS motivo
         FROM contabilidad.auditoria
        WHERE entidad = 'escrow_pedido' AND accion = 'DESBLOQUEAR'`,
    );
    expect(auditoria.rows).toEqual([
      { usuario: 'u-admin', motivo: 'PQR-9 resuelta a favor del vendedor' },
    ]);
  });

  it('la tabla escrow_pedido tiene RLS como el resto del esquema', async () => {
    const { rows } = await testPool().query(
      `SELECT relrowsecurity FROM pg_class WHERE oid = 'contabilidad.escrow_pedido'::regclass`,
    );
    expect(rows[0].relrowsecurity).toBe(true);
  });
});
