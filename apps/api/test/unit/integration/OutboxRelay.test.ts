import { describe, expect, it } from 'vitest';
import {
  esperaReintento,
  parseDestinosOutbox,
} from '../../../src/infrastructure/messaging/OutboxRelay';
import { loadConfig } from '../../../src/infrastructure/config/env';

describe('parseDestinosOutbox', () => {
  it('lee "tipo=url" separados por coma, con * como destino por defecto', () => {
    expect(
      parseDestinosOutbox(
        ' contabilidad.pago-vendedor.registrado=https://notif.example/eventos , *=http://bus:8080/in ',
      ),
    ).toEqual({
      'contabilidad.pago-vendedor.registrado': 'https://notif.example/eventos',
      '*': 'http://bus:8080/in',
    });
    expect(parseDestinosOutbox(undefined)).toEqual({});
  });

  it('rechaza entradas sin url http(s) o con tipos repetidos', () => {
    expect(() => parseDestinosOutbox('tipo')).toThrow(/OUTBOX_DESTINOS/);
    expect(() => parseDestinosOutbox('tipo=ftp://x')).toThrow(/OUTBOX_DESTINOS/);
    expect(() => parseDestinosOutbox('a=https://x,a=https://y')).toThrow(/repite/);
  });
});

describe('esperaReintento', () => {
  it('duplica la espera en cada intento hasta el tope', () => {
    expect([1, 2, 3, 4].map((i) => esperaReintento(i, 5_000, 30_000))).toEqual([
      5_000, 10_000, 20_000, 30_000,
    ]);
    expect(esperaReintento(50, 5_000, 3_600_000)).toBe(3_600_000);
  });
});

describe('configuración del relay', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

  it('sin OUTBOX_DESTINOS el relay queda deshabilitado; los valores por defecto son razonables', () => {
    const cfg = loadConfig(base);
    expect(cfg.OUTBOX_DESTINOS).toEqual({});
    expect(cfg).toMatchObject({
      OUTBOX_INTERVALO_MS: 5_000,
      OUTBOX_LOTE: 20,
      OUTBOX_MAX_INTENTOS: 8,
      OUTBOX_TIMEOUT_MS: 5_000,
    });
  });

  it('informa un OUTBOX_DESTINOS mal formado', () => {
    expect(() => loadConfig({ ...base, OUTBOX_DESTINOS: 'sin-url' })).toThrow(/OUTBOX_DESTINOS/);
  });
});
