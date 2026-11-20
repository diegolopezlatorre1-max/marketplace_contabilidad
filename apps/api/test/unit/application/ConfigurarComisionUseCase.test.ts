import { describe, expect, it } from 'vitest';
import { ConfigurarComisionUseCase } from '../../../src/application/commands/ConfigurarComisionUseCase';
import { ObtenerComisionVigenteQuery } from '../../../src/application/queries/ObtenerComisionVigenteQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { ConfiguracionComision } from '../../../src/domain/comision/ConfiguracionComision';
import { InvalidValueError, Porcentaje } from '../../../src/domain/shared';
import { crearBaseEnMemoria } from './enMemoria';

const admin: Actor = { id: 'u-admin', nombre: 'Admin', roles: ['ADMIN_FINANCIERO'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
// 2026-10-16 en Bogotá.
const reloj = { now: () => new Date('2026-10-16T15:00:00Z') };

function crearEntorno() {
  const { db, repos, uow } = crearBaseEnMemoria();
  let siguiente = 0;
  const configurar = new ConfigurarComisionUseCase(uow, reloj, () => `c-${++siguiente}`);
  return { db, repo: repos.configuracionComision, configurar };
}

function global10(db: ReturnType<typeof crearEntorno>['db']) {
  db.datos.configuraciones.push(
    ConfiguracionComision.crear({
      id: 'c-0',
      porcentaje: Porcentaje.of('10'),
      alcance: 'GLOBAL',
      vigenteDesde: '2026-01-01',
      creadoPor: 'seed',
    }),
  );
}

describe('ConfigurarComisionUseCase', () => {
  it('solo el ADMIN_FINANCIERO puede configurar', async () => {
    const { configurar, db } = crearEntorno();
    await expect(
      configurar.execute({ porcentaje: '12', vigenteDesde: '2026-10-16' }, { actor: contador }),
    ).rejects.toThrow(NoAutorizadoError);
    expect(db.datos.configuraciones).toHaveLength(0);
  });

  it('registra la primera vigencia', async () => {
    const { configurar } = crearEntorno();
    const estado = await configurar.execute(
      { porcentaje: '10', vigenteDesde: '2026-01-01' },
      { actor: admin },
    );
    expect(estado.vigente?.porcentaje.toString()).toBe('10.0000');
    expect(estado.historial).toHaveLength(1);
  });

  it('cierra la vigencia anterior el día previo al inicio de la nueva', async () => {
    const { configurar, db } = crearEntorno();
    global10(db);
    const estado = await configurar.execute(
      { porcentaje: '12', vigenteDesde: '2026-10-16' },
      { actor: admin },
    );
    expect(estado.fecha).toBe('2026-10-16');
    expect(estado.vigente?.toJSON()).toMatchObject({ id: 'c-1', porcentaje: '12.0000' });
    expect(estado.historial.map((c) => [c.id, c.vigenteDesde, c.vigenteHasta])).toEqual([
      ['c-1', '2026-10-16', null],
      ['c-0', '2026-01-01', '2026-10-15'],
    ]);
  });

  it('acepta una vigencia retroactiva posterior al inicio de la actual', async () => {
    const { configurar, repo, db } = crearEntorno();
    global10(db);
    await configurar.execute({ porcentaje: '11', vigenteDesde: '2026-06-01' }, { actor: admin });
    expect(await repo.obtenerVigente('2026-05-31', 'V-1')).toEqual(Porcentaje.of('10'));
    expect(await repo.obtenerVigente('2026-06-01', 'V-1')).toEqual(Porcentaje.of('11'));
  });

  it('rechaza una vigencia que se solaparía y no deja cambios', async () => {
    const { configurar, db } = crearEntorno();
    global10(db);
    await expect(
      configurar.execute({ porcentaje: '12', vigenteDesde: '2026-01-01' }, { actor: admin }),
    ).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(db.datos.configuraciones).toHaveLength(1);
    expect(db.datos.configuraciones[0]?.abierta).toBe(true);
    expect(db.datos.auditoria).toHaveLength(0);
  });

  it('valida porcentaje y fecha', async () => {
    const { configurar } = crearEntorno();
    await expect(
      configurar.execute({ porcentaje: '120', vigenteDesde: '2026-10-16' }, { actor: admin }),
    ).rejects.toThrow(InvalidValueError);
    await expect(
      configurar.execute({ porcentaje: '12', vigenteDesde: '2026-02-30' }, { actor: admin }),
    ).rejects.toThrow(InvalidValueError);
  });

  it('registra la auditoría con valores anteriores y nuevos', async () => {
    const { configurar, db } = crearEntorno();
    global10(db);
    await configurar.execute(
      { porcentaje: '12', vigenteDesde: '2026-10-16' },
      { actor: admin, correlationId: 'corr-1' },
    );
    expect(db.datos.auditoria).toEqual([
      {
        entidad: 'configuracion_comision',
        entidadId: 'c-1',
        accion: 'CONFIGURAR',
        usuario: 'u-admin',
        valoresAnteriores: {
          vigente: expect.objectContaining({ id: 'c-0', porcentaje: '10.0000' }),
        },
        valoresNuevos: {
          vigente: expect.objectContaining({ id: 'c-1', porcentaje: '12.0000' }),
          anteriorCerradaHasta: '2026-10-15',
        },
        correlationId: 'corr-1',
      },
    ]);
  });
});

describe('ObtenerComisionVigenteQuery', () => {
  it('devuelve la vigente de hoy por defecto y la de una fecha dada', async () => {
    const { configurar, repo, db } = crearEntorno();
    global10(db);
    await configurar.execute({ porcentaje: '12', vigenteDesde: '2026-10-16' }, { actor: admin });
    const query = new ObtenerComisionVigenteQuery(repo, reloj);

    const hoy = await query.execute({}, { actor: contador });
    expect(hoy.vigente?.porcentaje.toString()).toBe('12.0000');
    const antes = await query.execute({ fecha: '2026-10-15' }, { actor: contador });
    expect(antes.vigente?.porcentaje.toString()).toBe('10.0000');
    expect(antes.historial).toHaveLength(2);
    const sinConfig = await query.execute({ fecha: '2025-12-31' }, { actor: admin });
    expect(sinConfig.vigente).toBeNull();
  });

  it('exige rol CONTADOR o ADMIN_FINANCIERO', async () => {
    const query = new ObtenerComisionVigenteQuery(crearEntorno().repo, reloj);
    const sistema: Actor = { id: 's', nombre: 'S', roles: ['SISTEMA'] };
    await expect(query.execute({}, { actor: sistema })).rejects.toThrow(NoAutorizadoError);
  });
});
