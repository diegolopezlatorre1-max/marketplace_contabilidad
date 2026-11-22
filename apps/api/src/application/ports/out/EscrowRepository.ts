import type { EscrowPedido } from '../../../domain/escrow/EscrowPedido';
import type { Money } from '../../../domain/shared';

/** Custodia (escrow) del dinero de cada pedido. */
export interface EscrowRepository {
  obtener(pedidoId: string): Promise<EscrowPedido | null>;
  /** Crea o actualiza el registro del pedido. */
  guardar(escrow: EscrowPedido): Promise<void>;
  /**
   * Neto aún no pagable de un vendedor por quincena (código de periodo → valor): ventas de
   * pedidos que no están LIBERADOS (sin entrega o sin registro, RETENIDOS por menos de 72 h desde
   * la entrega, o BLOQUEADOS por PQR), descontando sus ajustes.
   */
  netoRetenidoPorPeriodo(vendedorId: string, ahora: Date): Promise<Map<string, Money>>;
  /** Números de orden del vendedor que hoy retienen el pago (no LIBERADOS). */
  pedidosRetenidos(vendedorId: string, ahora: Date): Promise<Set<string>>;
}
