import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { PgUnitOfWork } from '../../src/infrastructure/persistence/postgres/PgUnitOfWork';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });

function crearApp() {
  const { router } = createContabilidadModule({
    config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
    pool: testPool(),
    logger,
  });
  return createHttpApp({ router, logger, corsOrigins: [] });
}

beforeEach(limpiarTablas);

describe('Fase 1 - el módulo atraviesa todas las capas contra PostgreSQL', () => {
  it('GET /health consulta la base de datos real', async () => {
    const res = await request(crearApp()).get('/api/v1/contabilidad/health');
    expect(res.status).toBe(200);
    expect(res.body.checks.baseDeDatos).toBe('ok');
  });

  it('las migraciones crean el esquema contabilidad', async () => {
    const { rows } = await testPool().query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'contabilidad' ORDER BY tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'auditoria',
      'evento_ignorado',
      'inbox',
      'outbox',
    ]);
  });
});

describe('PgUnitOfWork', () => {
  it('confirma auditoría, inbox y outbox en una sola transacción', async () => {
    const uow = new PgUnitOfWork(testPool());
    await uow.run(async (repos) => {
      await repos.inbox.marcarProcesado('evt-1', 'orden.confirmada', { numeroOrden: 'A-1' });
      await repos.auditoria.registrar({
        entidad: 'venta_contable',
        entidadId: 'A-1',
        accion: 'CREAR',
        usuario: 'sistema',
        valoresNuevos: { valorBruto: '100000.00' },
        correlationId: 'corr-1',
      });
      await repos.outbox.publicar({
        tipo: 'contabilidad.venta.registrada',
        payload: { id: 'A-1' },
      });
    });

    const repos = new PgUnitOfWork(testPool());
    expect(await repos.run((r) => r.inbox.yaProcesado('evt-1'))).toBe(true);
    const auditoria = await testPool().query('SELECT * FROM contabilidad.auditoria');
    expect(auditoria.rows[0]).toMatchObject({
      entidad: 'venta_contable',
      valores_nuevos: { valorBruto: '100000.00' },
      correlation_id: 'corr-1',
    });
    const outbox = await testPool().query(
      'SELECT * FROM contabilidad.outbox WHERE publicado_en IS NULL',
    );
    expect(outbox.rowCount).toBe(1);
  });

  it('revierte todo si el trabajo falla', async () => {
    const uow = new PgUnitOfWork(testPool());
    await expect(
      uow.run(async (repos) => {
        await repos.inbox.marcarProcesado('evt-2', 'orden.confirmada', {});
        await repos.outbox.publicar({ tipo: 'x', payload: {} });
        throw new Error('fallo de negocio');
      }),
    ).rejects.toThrow('fallo de negocio');

    const inbox = await testPool().query('SELECT 1 FROM contabilidad.inbox');
    const outbox = await testPool().query('SELECT 1 FROM contabilidad.outbox');
    expect(inbox.rowCount).toBe(0);
    expect(outbox.rowCount).toBe(0);
  });

  it('impide procesar dos veces el mismo evento (UNIQUE event_id)', async () => {
    const uow = new PgUnitOfWork(testPool());
    await uow.run((r) => r.inbox.marcarProcesado('evt-3', 'orden.confirmada', {}));
    await expect(
      uow.run((r) => r.inbox.marcarProcesado('evt-3', 'orden.confirmada', {})),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('registra eventos ignorados', async () => {
    const uow = new PgUnitOfWork(testPool());
    await uow.run((r) =>
      r.inbox.registrarIgnorado('evt-4', 'orden.confirmada', 'Estado PENDIENTE', {
        estado: 'PENDIENTE',
      }),
    );
    const { rows } = await testPool().query('SELECT motivo FROM contabilidad.evento_ignorado');
    expect(rows).toEqual([{ motivo: 'Estado PENDIENTE' }]);
  });
});
