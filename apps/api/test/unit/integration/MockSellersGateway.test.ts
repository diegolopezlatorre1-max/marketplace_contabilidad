import { describe, expect, it } from 'vitest';
import { MockSellersGateway } from '../../../src/infrastructure/integration/sellers/MockSellersGateway';

describe('MockSellersGateway', () => {
  it('conoce a los vendedores del simulador de órdenes (V-1 a V-5)', async () => {
    const nombres = await new MockSellersGateway().obtenerNombres([
      'V-1',
      'V-2',
      'V-3',
      'V-4',
      'V-5',
    ]);
    expect(nombres.size).toBe(5);
    expect(nombres.get('V-1')).toBe('Artesanías del Valle S.A.S.');
  });

  it('omite los ids desconocidos y los repetidos', async () => {
    const nombres = await new MockSellersGateway({ A: 'Uno' }).obtenerNombres(['A', 'A', 'X']);
    expect([...nombres.entries()]).toEqual([['A', 'Uno']]);
  });
});
