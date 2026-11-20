import type { FechaContable, Porcentaje } from '../../../domain/shared';

/**
 * Porcentaje de comisión vigente para una venta (HU-CON-09 -> HU-CON-01/02).
 * Acordado en T-27. Prioridad: vendedor > categoría > global.
 */
export interface CommissionConfigProvider {
  /** Lanza ComisionNoConfiguradaError (422) si ninguna configuración cubre la fecha. */
  obtenerVigente(
    fecha: FechaContable,
    vendedorId: string,
    categoriaId?: string,
  ): Promise<Porcentaje>;
}
