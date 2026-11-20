import type { AjusteContable, AjustesPrevios } from '../../../domain/ajuste/AjusteContable';
import type { FechaContable } from '../../../domain/shared';

export interface FiltroAjustes {
  ventaId?: string | undefined;
  vendedorId?: string | undefined;
  /** Fecha contable del ajuste (inclusive). */
  desde?: FechaContable | undefined;
  hasta?: FechaContable | undefined;
  page: number;
  size: number;
}

/** Modelo de lectura de un ajuste registrado (HU-CON-06). Montos como string decimal. */
export interface AjusteRegistrado {
  id: string;
  ventaId: string;
  numeroOrden: string;
  vendedorId: string;
  tipo: 'DEVOLUCION' | 'CANCELACION';
  motivo: string;
  fecha: string;
  fechaContable: FechaContable;
  periodo: string;
  valor: string;
  porcentajeAplicado: string;
  comisionRevertida: string;
  netoRevertido: string;
  saldoAFavor: string;
  origen: 'MANUAL' | 'EVENTO';
  registradoPor: string;
  registradoEn: string;
}

export interface PaginaAjustes {
  items: AjusteRegistrado[];
  page: number;
  size: number;
  total: number;
}

export interface AjusteContableRepository {
  guardar(ajuste: AjusteContable, registradoEn: Date): Promise<void>;
  /** Suma de los ajustes ya registrados sobre la venta (D-07: límite de lo ajustable). */
  previosDeVenta(ventaId: string): Promise<AjustesPrevios>;
  /** Del más reciente al más antiguo. */
  listar(filtro: FiltroAjustes): Promise<PaginaAjustes>;
}
