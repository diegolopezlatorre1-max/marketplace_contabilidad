import type { SellersGateway } from '../ports/out/SellersGateway';

/** Agrega el nombre del vendedor a cada fila; si Vendedores no lo conoce, usa su id. */
export async function conNombreVendedor<T extends { vendedorId: string }>(
  filas: T[],
  vendedores: SellersGateway,
): Promise<Array<T & { vendedorNombre: string }>> {
  if (filas.length === 0) return [];
  const nombres = await vendedores.obtenerNombres(filas.map((f) => f.vendedorId));
  return filas.map((f) => ({ ...f, vendedorNombre: nombres.get(f.vendedorId) ?? f.vendedorId }));
}
