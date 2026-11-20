import type { ComisionVenta } from '../../../domain/comision/ComisionVenta';

/** Persistencia de la comisión de una venta (HU-CON-02). Acordado en T-27. */
export interface ComisionRepository {
  guardar(ventaId: string, comision: ComisionVenta): Promise<void>;
}
