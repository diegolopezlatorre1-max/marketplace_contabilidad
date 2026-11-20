import { describe, expect, it } from 'vitest';
import {
  ApiKeyServiceAuth,
  parseServiceApiKeys,
} from '../../../src/infrastructure/integration/auth/ApiKeyServiceAuth';

describe('ApiKeyServiceAuth', () => {
  const servicios = new ApiKeyServiceAuth({
    ordenes: 'clave-ordenes-0123456789',
    pagos: 'clave-pagos-0123456789',
  });

  it('identifica el módulo dueño de la clave', () => {
    expect(servicios.autenticar('clave-pagos-0123456789')).toEqual({
      id: 'servicio:pagos',
      nombre: 'Módulo pagos',
      roles: [],
      servicio: 'pagos',
    });
  });

  it('rechaza claves desconocidas', () => {
    expect(servicios.autenticar('clave-ordenes-012345678')).toBeNull();
    expect(new ApiKeyServiceAuth({}).autenticar('x')).toBeNull();
  });
});

describe('parseServiceApiKeys', () => {
  it('lee "modulo:clave" separados por coma', () => {
    expect(parseServiceApiKeys(' ordenes:aaaaaaaaaaaaaaaa , pagos:bbbbbbbbbbbbbbbb ')).toEqual({
      ordenes: 'aaaaaaaaaaaaaaaa',
      pagos: 'bbbbbbbbbbbbbbbb',
    });
    expect(parseServiceApiKeys(undefined)).toEqual({});
  });

  it('rechaza formatos inválidos, claves cortas y módulos repetidos', () => {
    expect(() => parseServiceApiKeys('sin-separador')).toThrow(/SERVICE_API_KEYS/);
    expect(() => parseServiceApiKeys('ordenes:corta')).toThrow(/16/);
    expect(() => parseServiceApiKeys('ordenes:aaaaaaaaaaaaaaaa,ordenes:bbbbbbbbbbbbbbbb')).toThrow(
      /repite/,
    );
  });
});
