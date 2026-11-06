import type { MovimientosPeriodo } from '../../../domain/cuentaPorPagar/EstadoVendedor';

/** Puerto de lectura del estado financiero de un vendedor (HU-CON-07). */
export interface EstadoVendedorRepository {
  /**
   * Movimientos del vendedor agrupados por la quincena de sus ventas (la de su cuenta por pagar),
   * de la más antigua a la más reciente. `desde` / `hasta` son quincenas, inclusive.
   */
  movimientosPorPeriodo(
    vendedorId: string,
    desde?: string,
    hasta?: string,
  ): Promise<MovimientosPeriodo[]>;
}
