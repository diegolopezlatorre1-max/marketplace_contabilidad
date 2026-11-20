import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContabilidadModule } from '../../src/bootstrap/container';
import { Porcentaje } from '../../src/domain/shared';
import { createHttpApp } from '../../src/infrastructure/http/express/createHttpApp';
import { PgUnitOfWork } from '../../src/infrastructure/persistence/postgres/PgUnitOfWork';
import { limpiarTablas, testPool } from './db';

const logger = pino({ level: 'silent' });
const URL = '/api/v1/contabilidad/comisiones/configuracion';
// "Hoy" para las pruebas: 2026-10-16 en Bogotá.
const reloj = { now: () => new Date('2026-10-16T15:00:00Z') };

function crearApp() {
  const { router } = createContabilidadModule({
    config: { INTEGRATION_MODE: 'mock', AUTH_MODE: 'mock' },
    pool: testPool(),
    logger,
    overrides: { clock: reloj },
  });
  return createHttpApp({ router, logger, corsOrigins: [] });
}

const comoAdmin = (body: object) =>
  request(crearApp()).put(URL).set('authorization', 'Bearer mock-admin').send(body);

beforeEach(async () => {
  await limpiarTablas();
  // Mismo dato que el seed 010_comision_global.sql.
  await testPool().query(
    `INSERT INTO contabilidad.configuracion_comision
       (id, porcentaje, alcance, vigente_desde, creado_por)
     VALUES (gen_random_uuid(), 10, 'GLOBAL', '2026-01-01', 'seed')`,
  );
});

describe('HU-CON-09 - configurar el porcentaje de comisión', () => {
  it('el contador consulta el porcentaje vigente', async () => {
    const res = await request(crearApp()).get(URL).set('authorization', 'Bearer mock-contador');
    expect(res.status).toBe(200);
    expect(res.body.fecha).toBe('2026-10-16');
    expect(res.body.vigente).toMatchObject({
      porcentaje: '10.0000',
      alcance: 'GLOBAL',
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
    });
  });

  it('el contador no puede configurar', async () => {
    const res = await request(crearApp())
      .put(URL)
      .set('authorization', 'Bearer mock-contador')
      .send({ porcentaje: '12', vigenteDesde: '2026-10-16' });
    expect(res.status).toBe(403);
  });

  it('una nueva vigencia cierra la anterior el día previo y queda auditada', async () => {
    const res = await comoAdmin({ porcentaje: '12', vigenteDesde: '2026-10-16' }).set(
      'x-correlation-id',
      'corr-hu09',
    );
    expect(res.status).toBe(200);
    expect(res.body.vigente).toMatchObject({ porcentaje: '12.0000', creadoPor: 'u-admin' });
    expect(
      res.body.historial.map((v: { vigenteDesde: string; vigenteHasta: string | null }) => [
        v.vigenteDesde,
        v.vigenteHasta,
      ]),
    ).toEqual([
      ['2026-10-16', null],
      ['2026-01-01', '2026-10-15'],
    ]);

    const { rows } = await testPool().query(
      `SELECT accion, usuario, valores_anteriores, valores_nuevos, correlation_id
         FROM contabilidad.auditoria WHERE entidad = 'configuracion_comision'`,
    );
    expect(rows).toEqual([
      {
        accion: 'CONFIGURAR',
        usuario: 'u-admin',
        valores_anteriores: { vigente: expect.objectContaining({ porcentaje: '10.0000' }) },
        valores_nuevos: {
          vigente: expect.objectContaining({ porcentaje: '12.0000' }),
          anteriorCerradaHasta: '2026-10-15',
        },
        correlation_id: 'corr-hu09',
      },
    ]);
  });

  it('consulta el porcentaje vigente en cualquier fecha', async () => {
    await comoAdmin({ porcentaje: '12', vigenteDesde: '2026-10-16' });
    const consultar = (fecha: string) =>
      request(crearApp()).get(`${URL}?fecha=${fecha}`).set('authorization', 'Bearer mock-contador');

    expect((await consultar('2026-10-15')).body.vigente.porcentaje).toBe('10.0000');
    expect((await consultar('2026-10-16')).body.vigente.porcentaje).toBe('12.0000');
    expect((await consultar('2025-12-31')).body.vigente).toBeNull();
  });

  it('rechaza una vigencia que se solaparía (409) sin dejar cambios', async () => {
    const res = await comoAdmin({ porcentaje: '12', vigenteDesde: '2025-06-01' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICTO');

    const { rows } = await testPool().query(
      `SELECT vigente_hasta FROM contabilidad.configuracion_comision`,
    );
    expect(rows).toEqual([{ vigente_hasta: null }]);
    const auditoria = await testPool().query('SELECT 1 FROM contabilidad.auditoria');
    expect(auditoria.rowCount).toBe(0);
  });

  it('la BD impide vigencias solapadas aunque se salte el dominio', async () => {
    await expect(
      testPool().query(
        `INSERT INTO contabilidad.configuracion_comision
           (id, porcentaje, alcance, vigente_desde, vigente_hasta, creado_por)
         VALUES (gen_random_uuid(), 15, 'GLOBAL', '2026-03-01', '2026-03-31', 'x')`,
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });
});

describe('CommissionConfigProvider (para la HU-CON-01)', () => {
  it('aplica la prioridad vendedor > global dentro de la UnitOfWork', async () => {
    await testPool().query(
      `INSERT INTO contabilidad.configuracion_comision
         (id, porcentaje, alcance, referencia_id, vigente_desde, creado_por)
       VALUES (gen_random_uuid(), 7.5, 'VENDEDOR', 'V-1', '2026-06-01', 'x')`,
    );
    const uow = new PgUnitOfWork(testPool());
    const obtener = (fecha: string, vendedor: string) =>
      uow.run((r) => r.configuracionComision.obtenerVigente(fecha, vendedor));

    expect(await obtener('2026-07-01', 'V-1')).toEqual(Porcentaje.of('7.5'));
    expect(await obtener('2026-07-01', 'V-2')).toEqual(Porcentaje.of('10'));
    expect(await obtener('2026-05-31', 'V-1')).toEqual(Porcentaje.of('10'));
    await expect(obtener('2025-12-31', 'V-1')).rejects.toMatchObject({
      code: 'COMISION_NO_CONFIGURADA',
    });
  });
});
