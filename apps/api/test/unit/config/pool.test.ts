import { describe, expect, it } from 'vitest';
import {
  opcionesPoolDesdeEntorno,
  opcionesSsl,
} from '../../../src/infrastructure/persistence/postgres/pool';

describe('opcionesSsl', () => {
  it('disable no usa TLS y no-verify no valida el certificado', () => {
    expect(opcionesSsl({})).toBe(false);
    expect(opcionesSsl({ ssl: 'no-verify' })).toEqual({ rejectUnauthorized: false });
  });

  it('verify valida el certificado y acepta la CA con saltos de línea escapados', () => {
    expect(opcionesSsl({ ssl: 'verify' })).toEqual({ rejectUnauthorized: true });
    expect(opcionesSsl({ ssl: 'verify', ca: 'LINEA1\\nLINEA2' })).toEqual({
      rejectUnauthorized: true,
      ca: 'LINEA1\nLINEA2',
    });
  });
});

describe('opcionesPoolDesdeEntorno', () => {
  it('lee DATABASE_SSL y DATABASE_SSL_CA, y rechaza valores desconocidos', () => {
    expect(opcionesPoolDesdeEntorno({})).toEqual({ ssl: 'disable', ca: undefined });
    expect(opcionesPoolDesdeEntorno({ DATABASE_SSL: 'verify', DATABASE_SSL_CA: 'PEM' })).toEqual({
      ssl: 'verify',
      ca: 'PEM',
    });
    expect(() => opcionesPoolDesdeEntorno({ DATABASE_SSL: 'require' })).toThrow(/DATABASE_SSL/);
  });
});
