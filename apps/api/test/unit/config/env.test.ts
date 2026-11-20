import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/infrastructure/config/env';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };
const CLAVES = 'ordenes:aaaaaaaaaaaaaaaa';

describe('loadConfig', () => {
  it('por defecto usa AUTH_MODE=mock y sin claves de servicio', () => {
    const cfg = loadConfig(base);
    expect(cfg.AUTH_MODE).toBe('mock');
    expect(cfg.SERVICE_API_KEYS).toEqual({});
  });

  it('AUTH_MODE=supabase exige la URL y la publishable key', () => {
    expect(() => loadConfig({ ...base, AUTH_MODE: 'supabase' })).toThrow(
      /SUPABASE_URL[\s\S]*SUPABASE_PUBLISHABLE_KEY/,
    );
    const cfg = loadConfig({
      ...base,
      AUTH_MODE: 'supabase',
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
    });
    expect(cfg.SUPABASE_URL).toBe('https://abc.supabase.co');
  });

  it('en producción no permite mock y exige claves de servicio', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/SERVICE_API_KEYS/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', SERVICE_API_KEYS: CLAVES })).toThrow(
      /mock no está permitido/,
    );
  });

  it('informa un SERVICE_API_KEYS mal formado', () => {
    expect(() => loadConfig({ ...base, SERVICE_API_KEYS: 'ordenes' })).toThrow(/SERVICE_API_KEYS/);
  });
});
