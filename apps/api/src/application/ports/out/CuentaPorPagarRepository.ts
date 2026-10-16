import type { CuentaPorPagar } from '../../../domain/cuentaPorPagar/cuentaPorPagar';
import type { Periodo } from '../../../domain/shared';

export type EstadoCuentaPorPagar = 'PENDIENTE' | 'PAGADO';

export interface FiltroCuentasPorPagar {
  periodo?: string | undefined;
  estado?: EstadoCuentaPorPagar | undefined;
  vendedorId?: string | undefined;
}

/** Modelo de lectura del listado de cuentas por pagar (HU-CON-03). */
export interface CuentaPorPagarResumen {
  vendedorId: string;
  periodo: string;
  totalNeto: string;
  valorPagado: string;
  saldoPendiente: string;
  estado: EstadoCuentaPorPagar;
}

/** Persistencia de las cuentas por pagar a vendedores (HU-CON-03). Acordado en T-27. */
export interface CuentaPorPagarRepository {
  /**
   * Cuenta del vendedor en el periodo, creada vacía si no existe y bloqueada
   * hasta el fin de la transacción (evita perder sumas con ventas simultáneas).
   */
  obtenerParaActualizar(vendedorId: string, periodo: Periodo): Promise<CuentaPorPagar>;
  guardar(cuenta: CuentaPorPagar): Promise<void>;
  /** Ordenadas por periodo (más reciente primero) y vendedor. */
  listar(filtro: FiltroCuentasPorPagar): Promise<CuentaPorPagarResumen[]>;
}
