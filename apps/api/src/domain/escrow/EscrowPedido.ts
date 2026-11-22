import { InvalidValueError } from '../shared/DomainError';

/** Horas que el dinero queda retenido después de la entrega (GUIA_EQUIPO_6, sección 6). */
export const HORAS_RETENCION = 72;
const MS_RETENCION = HORAS_RETENCION * 60 * 60 * 1000;
const MAX_PEDIDO = 64;
const MAX_MOTIVO = 500;

/**
 * Estado del dinero de un pedido:
 *  - SIN_ENTREGA: todavía no se ha entregado; no se paga.
 *  - RETENIDO:    entregado hace menos de 72 h; el comprador aún puede reclamar. No se paga.
 *  - LIBERADO:    pasaron las 72 h sin bloqueo; se le puede pagar al vendedor.
 *  - BLOQUEADO:   hay una PQR abierta; no se paga hasta que el ADMIN lo desbloquee.
 * Un pedido sin registro de escrow equivale a SIN_ENTREGA: su dinero queda retenido hasta que
 * Órdenes marque la entrega y pasen las 72 h.
 */
export type EstadoEscrow = 'SIN_ENTREGA' | 'RETENIDO' | 'LIBERADO' | 'BLOQUEADO';

export interface EscrowPedidoDatos {
  pedidoId: string;
  entregadoEn: Date | null;
  liberableDesde: Date | null;
  bloqueado: boolean;
  bloqueadoEn: Date | null;
  motivoBloqueo: string | null;
  actualizadoEn: Date;
}

function validarFecha(fecha: Date, ahora: Date, campo: string): void {
  if (Number.isNaN(fecha.getTime())) throw new InvalidValueError(`${campo} inválida`);
  if (fecha.getTime() > ahora.getTime()) {
    throw new InvalidValueError(`${campo} no puede ser futura`);
  }
}

function normalizarMotivo(motivo: string | undefined): string | null {
  const m = motivo?.trim() || null;
  if (m && m.length > MAX_MOTIVO) {
    throw new InvalidValueError(`El motivo admite máximo ${MAX_MOTIVO} caracteres`);
  }
  return m;
}

/** Custodia (escrow) del dinero de un pedido entre la entrega y el pago al vendedor. */
export class EscrowPedido {
  private constructor(private d: EscrowPedidoDatos) {}

  static nuevo(pedidoId: string, ahora: Date): EscrowPedido {
    const id = pedidoId.trim();
    if (!id) throw new InvalidValueError('El pedido es obligatorio');
    if (id.length > MAX_PEDIDO) {
      throw new InvalidValueError(`El pedido admite máximo ${MAX_PEDIDO} caracteres`);
    }
    return new EscrowPedido({
      pedidoId: id,
      entregadoEn: null,
      liberableDesde: null,
      bloqueado: false,
      bloqueadoEn: null,
      motivoBloqueo: null,
      actualizadoEn: ahora,
    });
  }

  static reconstituir(datos: EscrowPedidoDatos): EscrowPedido {
    return new EscrowPedido({ ...datos });
  }

  get pedidoId(): string {
    return this.d.pedidoId;
  }

  get datos(): Readonly<EscrowPedidoDatos> {
    return this.d;
  }

  /**
   * El módulo de Órdenes confirma la entrega: inicia la retención de 72 h.
   * Idempotente: una segunda entrega no reinicia el plazo. Devuelve si hubo cambio.
   */
  marcarEntrega(fechaEntrega: Date, ahora: Date): boolean {
    validarFecha(fechaEntrega, ahora, 'La fecha de entrega');
    if (this.d.entregadoEn) return false;
    this.d = {
      ...this.d,
      entregadoEn: fechaEntrega,
      liberableDesde: new Date(fechaEntrega.getTime() + MS_RETENCION),
      actualizadoEn: ahora,
    };
    return true;
  }

  /** Hay una PQR abierta sobre el pedido: bloquea el pago. Idempotente. */
  bloquear(motivo: string | undefined, ahora: Date): boolean {
    const m = normalizarMotivo(motivo);
    if (this.d.bloqueado) return false;
    this.d = {
      ...this.d,
      bloqueado: true,
      bloqueadoEn: ahora,
      motivoBloqueo: m,
      actualizadoEn: ahora,
    };
    return true;
  }

  /**
   * El ADMIN levanta el bloqueo manualmente (la PQR se resolvió). Si la entrega ya ocurrió, vuelve a contar la
   * retención original (si las 72 h ya pasaron, queda LIBERADO). Idempotente.
   */
  desbloquear(ahora: Date): boolean {
    if (!this.d.bloqueado) return false;
    this.d = {
      ...this.d,
      bloqueado: false,
      bloqueadoEn: null,
      motivoBloqueo: null,
      actualizadoEn: ahora,
    };
    return true;
  }

  estado(ahora: Date): EstadoEscrow {
    if (this.d.bloqueado) return 'BLOQUEADO';
    if (!this.d.liberableDesde) return 'SIN_ENTREGA';
    return ahora.getTime() < this.d.liberableDesde.getTime() ? 'RETENIDO' : 'LIBERADO';
  }

  /** El dinero del pedido no se le puede pagar todavía al vendedor. */
  retieneElPago(ahora: Date): boolean {
    return this.estado(ahora) !== 'LIBERADO';
  }

  toJSON(ahora: Date) {
    return {
      pedidoId: this.d.pedidoId,
      estado: this.estado(ahora),
      entregadoEn: this.d.entregadoEn?.toISOString() ?? null,
      liberableDesde: this.d.liberableDesde?.toISOString() ?? null,
      bloqueado: this.d.bloqueado,
      bloqueadoEn: this.d.bloqueadoEn?.toISOString() ?? null,
      motivoBloqueo: this.d.motivoBloqueo,
      actualizadoEn: this.d.actualizadoEn.toISOString(),
    };
  }
}
