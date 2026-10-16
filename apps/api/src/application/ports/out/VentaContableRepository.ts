import type { FechaContable } from '../../../domain/shared';
import type { VentaContable } from '../../../domain/venta/VentaContable';

export interface FiltroVentas {
  desde?: FechaContable | undefined;
  hasta?: FechaContable | undefined;
  vendedorId?: string | undefined;
  /** Quincena, p. ej. "2026-10-Q1". */
  periodo?: string | undefined;
  page: number;
  size: number;
}

/** Modelo de lectura del listado de ventas, con el desglose de su comisión. */
export interface VentaRegistrada {
  id: string;
  numeroOrden: string;
  vendedorId: string;
  categoriaId: string | null;
  fecha: string;
  fechaContable: FechaContable;
  periodo: string;
  valorBruto: string;
  porcentajeAplicado: string | null;
  comision: string | null;
  valorNeto: string | null;
}

/** Detalle de una venta (HU-CON-02). */
export interface VentaDetalle extends VentaRegistrada {
  estadoOrigen: string;
  registradoEn: string;
}

export interface PaginaVentas {
  items: VentaRegistrada[];
  page: number;
  size: number;
  total: number;
}

export interface VentaContableRepository {
  existe(numeroOrden: string, vendedorId: string): Promise<boolean>;
  /** La restricción UNIQUE (numero_orden, vendedor_id) es la barrera final ante duplicados. */
  guardar(venta: VentaContable, eventId: string): Promise<void>;
  listar(filtro: FiltroVentas): Promise<PaginaVentas>;
  obtener(id: string): Promise<VentaDetalle | null>;
  /** Venta de una línea de orden (eventos orden.cancelada / orden.devuelta). */
  obtenerPorOrden(numeroOrden: string, vendedorId: string): Promise<VentaDetalle | null>;
  /** Quincenas que tienen ventas, de la más reciente a la más antigua. */
  listarPeriodos(): Promise<string[]>;
}
