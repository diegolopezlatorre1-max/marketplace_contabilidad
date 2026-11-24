import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import {
  HttpSellersGateway,
  type ConsultarHttp,
} from '../../../src/infrastructure/integration/sellers/HttpSellersGateway';
import { crearSellersGateway } from '../../../src/bootstrap/container';
import { MockSellersGateway } from '../../../src/infrastructure/integration/sellers/MockSellersGateway';

const logger = pino({ level: 'silent' });
const opciones = { url: 'https://vendedores.test/api/', apiKey: 'clave', timeoutMs: 3000 };

function responder(status: number, cuerpo: unknown): ConsultarHttp {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  }));
}

describe('HttpSellersGateway', () => {
  it('consulta los ids sin repetir, con x-api-key, y devuelve los nombres', async () => {
    const consultar = responder(200, [
      { id: 'V-1', nombre: 'Uno' },
      { id: 'V-2', nombre: 'Dos' },
    ]);
    const nombres = await new HttpSellersGateway(opciones, logger, consultar).obtenerNombres([
      'V-1',
      'V-2',
      'V-1',
    ]);

    expect([...nombres.entries()]).toEqual([
      ['V-1', 'Uno'],
      ['V-2', 'Dos'],
    ]);
    const [url, init] = vi.mocked(consultar).mock.calls[0]!;
    expect(url).toBe('https://vendedores.test/api/vendedores?ids=V-1,V-2');
    expect(init.method).toBe('GET');
    expect(init.headers['x-api-key']).toBe('clave');
  });

  it('sin ids no llama a Vendedores', async () => {
    const consultar = responder(200, []);
    const nombres = await new HttpSellersGateway(opciones, logger, consultar).obtenerNombres([]);
    expect(nombres.size).toBe(0);
    expect(consultar).not.toHaveBeenCalled();
  });

  it('ignora elementos inválidos y ids que no se pidieron', async () => {
    const consultar = responder(200, [
      { id: 'V-1', nombre: 'Uno' },
      { id: 'V-9', nombre: 'No pedido' },
      { id: 'V-2' },
      null,
    ]);
    const nombres = await new HttpSellersGateway(opciones, logger, consultar).obtenerNombres([
      'V-1',
      'V-2',
    ]);
    expect([...nombres.entries()]).toEqual([['V-1', 'Uno']]);
  });

  it.each([
    ['un error HTTP', responder(503, { error: 'caído' })],
    ['un cuerpo que no es lista', responder(200, { datos: [] })],
    [
      'un error de red o timeout',
      vi.fn(async () => {
        throw new Error('timeout');
      }) as ConsultarHttp,
    ],
  ])('con %s devuelve un mapa vacío sin fallar', async (_caso, consultar) => {
    const nombres = await new HttpSellersGateway(opciones, logger, consultar).obtenerNombres([
      'V-1',
    ]);
    expect(nombres.size).toBe(0);
  });
});

describe('crearSellersGateway', () => {
  const base = { AUTH_MODE: 'mock' as const };

  it('INTEGRATION_MODE=mock usa el catálogo simulado', () => {
    expect(crearSellersGateway({ ...base, INTEGRATION_MODE: 'mock' }, logger)).toBeInstanceOf(
      MockSellersGateway,
    );
  });

  it('INTEGRATION_MODE=http usa el adaptador HTTP y exige VENDEDORES_URL', () => {
    expect(() => crearSellersGateway({ ...base, INTEGRATION_MODE: 'http' }, logger)).toThrow(
      /VENDEDORES_URL/,
    );
    expect(
      crearSellersGateway(
        { ...base, INTEGRATION_MODE: 'http', VENDEDORES_URL: 'https://vendedores.test' },
        logger,
      ),
    ).toBeInstanceOf(HttpSellersGateway);
  });
});
