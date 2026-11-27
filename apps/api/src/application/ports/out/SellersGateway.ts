/**
 * Datos del módulo de Vendedores que contabilidad muestra (HU-CON-03, T-23).
 * INTEGRATION_MODE=mock usa MockSellersGateway; http y events, HttpSellersGateway.
 */
export interface SellersGateway {
  /** Nombre o razón social por id; los ids desconocidos no aparecen en el mapa. */
  obtenerNombres(vendedorIds: string[]): Promise<Map<string, string>>;
}
