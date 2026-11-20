import type { SellersGateway } from '../../../application/ports/out/SellersGateway';

/** Vendedores de ejemplo; coinciden con los ids que usa el simulador de órdenes (V-1 a V-5). */
const CATALOGO: Record<string, string> = {
  'V-1': 'Artesanías del Valle S.A.S.',
  'V-2': 'Tecnología Andina Ltda.',
  'V-3': 'Café de la Montaña S.A.S.',
  'V-4': 'Moda Caribe S.A.S.',
  'V-5': 'Librería El Faro',
};

/**
 * Simula al módulo de Vendedores mientras su integración no está disponible
 * (INTEGRATION_MODE=mock). Los ids que no conoce no aparecen en el resultado.
 */
export class MockSellersGateway implements SellersGateway {
  constructor(private readonly catalogo: Record<string, string> = CATALOGO) {}

  async obtenerNombres(vendedorIds: string[]): Promise<Map<string, string>> {
    const nombres = new Map<string, string>();
    for (const id of new Set(vendedorIds)) {
      const nombre = this.catalogo[id];
      if (nombre) nombres.set(id, nombre);
    }
    return nombres;
  }
}
