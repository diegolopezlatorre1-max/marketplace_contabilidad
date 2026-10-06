import { describe, expect, it } from 'vitest';
import { ObtenerEstadoModulo } from '../../../src/application/queries/ObtenerEstadoModulo';
import { exigirRol, NoAutorizadoError, type Actor } from '../../../src/application/security';

const relojFijo = { now: () => new Date('2026-10-05T10:00:00Z') };

describe('ObtenerEstadoModulo', () => {
  it('reporta ok cuando la base de datos responde', async () => {
    const estado = await new ObtenerEstadoModulo({ ping: async () => true }, relojFijo).execute();
    expect(estado).toEqual({
      status: 'ok',
      checks: { baseDeDatos: 'ok' },
      fecha: new Date('2026-10-05T10:00:00Z'),
    });
  });

  it('reporta degradado cuando la base de datos no responde', async () => {
    const estado = await new ObtenerEstadoModulo({ ping: async () => false }, relojFijo).execute();
    expect(estado.status).toBe('degradado');
    expect(estado.checks.baseDeDatos).toBe('error');
  });
});

describe('exigirRol', () => {
  const contador: Actor = { id: '1', nombre: 'C', roles: ['CONTADOR'] };

  it('permite a un actor con el rol requerido', () => {
    expect(() => exigirRol(contador, ['CONTADOR', 'ADMIN_FINANCIERO'])).not.toThrow();
  });

  it('rechaza a un actor sin el rol requerido', () => {
    expect(() => exigirRol(contador, ['ADMIN_FINANCIERO'])).toThrow(NoAutorizadoError);
  });
});
