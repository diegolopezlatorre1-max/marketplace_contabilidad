import type { CuentaPorPagar } from '../../../domain/cuentaPorPagar/cuentaPorPagar';
import type { Periodo } from '../../../domain/shared';

/** Persistencia de las cuentas por pagar a vendedores (HU-CON-03). Acordado en T-27. */
export interface CuentaPorPagarRepository {
  /**
   * Cuenta del vendedor en el periodo, creada vacía si no existe y bloqueada
   * hasta el fin de la transacción (evita perder sumas con ventas simultáneas).
   */
  obtenerParaActualizar(vendedorId: string, periodo: Periodo): Promise<CuentaPorPagar>;
  guardar(cuenta: CuentaPorPagar): Promise<void>;
}
