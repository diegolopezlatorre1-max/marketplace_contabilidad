import type {
  Conciliacion,
  EstadoConciliacion,
  OrdenPorConciliar,
} from '../../../domain/conciliacion/Conciliacion';
import type { FechaContable } from '../../../domain/shared';

export interface FiltroConciliaciones {
  estado?: EstadoConciliacion | undefined;
  /** Rango por fecha contable del pago. */
  desde?: FechaContable | undefined;
  hasta?: FechaContable | undefined;
}

/** Modelo de lectura de una conciliación con sus órdenes. */
export interface ConciliacionResumen {
  id: string;
  pagoId: string;
  referenciaPasarela: string;
  fechaPago: string;
  valorPago: string;
  valorAplicado: string;
  diferencia: string;
  estado: EstadoConciliacion;
  usuario: string;
  fecha: string;
  detalles: Array<{ numeroOrden: string; valorOrden: string; valorAplicado: string }>;
}

/** Conciliaciones de pagos recibidos contra órdenes (HU-CON-04). */
export interface ConciliacionRepository {
  existeParaPago(pagoId: string): Promise<boolean>;
  /**
   * Valor de cada orden (suma del bruto de sus ventas) y lo ya aplicado en otras
   * conciliaciones. Las órdenes sin ventas no aparecen en el resultado.
   */
  ordenesPorConciliar(numerosOrden: readonly string[]): Promise<OrdenPorConciliar[]>;
  guardar(conciliacion: Conciliacion): Promise<void>;
  /** De la más reciente a la más antigua. */
  listar(filtro: FiltroConciliaciones): Promise<ConciliacionResumen[]>;
  obtener(id: string): Promise<ConciliacionResumen | null>;
}
