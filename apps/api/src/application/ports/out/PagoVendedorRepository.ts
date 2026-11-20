import type { PagoVendedor } from '../../../domain/pagoVendedor/PagoVendedor';
import type { FechaContable, Money } from '../../../domain/shared';

export interface FiltroPagosVendedor {
  vendedorId?: string | undefined;
  /** Fecha contable del pago (inclusive). */
  desde?: FechaContable | undefined;
  hasta?: FechaContable | undefined;
  page: number;
  size: number;
}

/** Modelo de lectura de un pago a vendedor (HU-CON-10). Montos como string decimal. */
export interface PagoVendedorRegistrado {
  id: string;
  vendedorId: string;
  fecha: string;
  fechaContable: FechaContable;
  valor: string;
  saldoAFavorAplicado: string;
  referencia: string;
  soporte: string | null;
  /** Cuentas a las que se aplicó, de la más antigua a la más reciente. */
  aplicaciones: Array<{
    periodo: string;
    valorAplicado: string;
    saldoAnterior: string;
    saldoNuevo: string;
    estado: 'PARCIAL' | 'PAGADO';
  }>;
  registradoPor: string;
  registradoEn: string;
}

export interface PaginaPagosVendedor {
  items: PagoVendedorRegistrado[];
  page: number;
  size: number;
  total: number;
}

/** Persistencia de los pagos a vendedores (HU-CON-10). */
export interface PagoVendedorRepository {
  guardar(pago: PagoVendedor, registradoEn: Date): Promise<void>;
  existeReferencia(vendedorId: string, referencia: string): Promise<boolean>;
  /**
   * Saldo a favor del marketplace aún no descontado: lo que dejaron los ajustes sobre cuentas
   * ya pagadas (D-07) menos lo que ya se descontó en pagos anteriores.
   */
  saldoAFavorDisponible(vendedorId: string): Promise<Money>;
  /** Del más reciente al más antiguo. */
  listar(filtro: FiltroPagosVendedor): Promise<PaginaPagosVendedor>;
}
