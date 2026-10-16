import type { PagoRecibido } from '../../../domain/conciliacion/PagoRecibido';
import type { FechaContable } from '../../../domain/shared';

export type EstadoPagoRecibido = 'SIN_CONCILIAR' | 'CONCILIADO' | 'PENDIENTE';

export interface FiltroPagosRecibidos {
  estado?: EstadoPagoRecibido | undefined;
  desde?: FechaContable | undefined;
  hasta?: FechaContable | undefined;
}

/** Modelo de lectura de la bandeja de pagos recibidos. */
export interface PagoRecibidoResumen {
  id: string;
  referenciaPasarela: string;
  fecha: string;
  fechaContable: FechaContable;
  valor: string;
  origen: string;
  ordenesInformadas: string[];
  estado: EstadoPagoRecibido;
  conciliacionId: string | null;
  diferencia: string | null;
}

/** Pagos recibidos de la pasarela (HU-CON-04). */
export interface PagoRecibidoRepository {
  existeReferencia(referenciaPasarela: string): Promise<boolean>;
  /** UNIQUE (referencia_pasarela) es la barrera final ante pagos duplicados. */
  guardar(pago: PagoRecibido, registradoPor: string): Promise<void>;
  /** Pago bloqueado hasta el fin de la transacción (evita conciliarlo dos veces). */
  obtenerParaConciliar(id: string): Promise<PagoRecibido | null>;
  /** Del más reciente al más antiguo. */
  listar(filtro: FiltroPagosRecibidos): Promise<PagoRecibidoResumen[]>;
}
