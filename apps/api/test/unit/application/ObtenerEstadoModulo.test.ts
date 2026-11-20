import { describe, expect, it } from 'vitest';
import { ObtenerEstadoModulo } from '../../../src/application/queries/ObtenerEstadoModulo';
import {
  alcanceVendedor,
  exigirRol,
  exigirServicio,
  NoAutorizadoError,
  type Actor,
} from '../../../src/application/security';

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
  const admin: Actor = { id: '1', nombre: 'A', roles: ['ADMIN'] };
  const comprador: Actor = { id: '2', nombre: 'C', roles: ['COMPRADOR'] };

  it('permite a un actor con el rol requerido', () => {
    expect(() => exigirRol(admin, ['ADMIN', 'VENDEDOR'])).not.toThrow();
  });

  it('rechaza a un actor sin el rol requerido', () => {
    expect(() => exigirRol(comprador, ['ADMIN'])).toThrow(NoAutorizadoError);
  });
});

describe('alcanceVendedor y exigirServicio', () => {
  const admin: Actor = { id: 'a', nombre: 'A', roles: ['ADMIN'] };
  const vendedor: Actor = { id: 'v', nombre: 'V', roles: ['VENDEDOR'], vendedorId: 'V-1' };
  const comprador: Actor = { id: 'c', nombre: 'C', roles: ['COMPRADOR'] };
  const servicio: Actor = {
    id: 'servicio:ordenes',
    nombre: 'Órdenes',
    roles: [],
    servicio: 'ordenes',
  };

  it('ADMIN consulta cualquier vendedor o todos', () => {
    expect(alcanceVendedor(admin, 'V-2')).toBe('V-2');
    expect(alcanceVendedor(admin)).toBeUndefined();
  });

  it('VENDEDOR queda limitado a su propio vendedor', () => {
    expect(alcanceVendedor(vendedor)).toBe('V-1');
    expect(alcanceVendedor(vendedor, 'V-1')).toBe('V-1');
    expect(() => alcanceVendedor(vendedor, 'V-2')).toThrow(NoAutorizadoError);
  });

  it('COMPRADOR, un VENDEDOR sin vendedor asociado y los servicios no consultan vendedores', () => {
    expect(() => alcanceVendedor(comprador)).toThrow(NoAutorizadoError);
    const sinVendedor: Actor = { id: 'v2', nombre: 'V2', roles: ['VENDEDOR'] };
    expect(() => alcanceVendedor(sinVendedor)).toThrow(NoAutorizadoError);
    expect(() => alcanceVendedor(servicio)).toThrow(NoAutorizadoError);
  });

  it('solo un servicio pasa exigirServicio', () => {
    expect(() => exigirServicio(servicio)).not.toThrow();
    expect(() => exigirServicio(admin)).toThrow(NoAutorizadoError);
  });
});
