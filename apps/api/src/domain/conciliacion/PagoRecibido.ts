import { DomainError, InvalidValueError } from '../shared/DomainError';
import { fechaContable, type FechaContable } from '../shared/FechaContable';
import type { Money } from '../shared/Money';

export const ORIGENES_PAGO = ['API', 'CSV', 'MANUAL'] as const;
export type OrigenPago = (typeof ORIGENES_PAGO)[number];

export class PagoInexistenteError extends DomainError {
  constructor(pagoId: string) {
    super('PAGO_INEXISTENTE', `No existe el pago recibido ${pagoId}`);
    this.name = 'PagoInexistenteError';
  }
}

/** La pasarela ya informó un pago con esa referencia (con otro eventId). */
export class ReferenciaDuplicadaError extends DomainError {
  constructor(referencia: string) {
    super('REFERENCIA_DUPLICADA', `Ya existe un pago con la referencia ${referencia}`);
    this.name = 'ReferenciaDuplicadaError';
  }
}

export interface RegistrarPagoDatos {
  id: string;
  referenciaPasarela: string;
  fecha: Date;
  valor: Money;
  origen: OrigenPago;
  eventId?: string | null | undefined;
  /** Órdenes que la pasarela dice que paga (opcional). */
  ordenesInformadas?: readonly string[] | undefined;
}

/**
 * Dinero recibido por la pasarela de pagos (HU-CON-04). Inmutable: su estado de
 * conciliación vive en la Conciliacion asociada.
 */
export class PagoRecibido {
  private constructor(
    readonly id: string,
    readonly referenciaPasarela: string,
    readonly fecha: Date,
    readonly fechaContable: FechaContable,
    readonly valor: Money,
    readonly origen: OrigenPago,
    readonly eventId: string | null,
    readonly ordenesInformadas: readonly string[],
  ) {}

  static registrar(d: RegistrarPagoDatos): PagoRecibido {
    const referencia = d.referenciaPasarela.trim();
    if (!referencia) throw new InvalidValueError('La referencia del pago es obligatoria');
    if (Number.isNaN(d.fecha.getTime())) throw new InvalidValueError('Fecha del pago inválida');
    if (!d.valor.isPositive()) {
      throw new InvalidValueError(
        `El valor del pago debe ser mayor que cero: ${d.valor.toString()}`,
      );
    }
    if (!ORIGENES_PAGO.includes(d.origen)) {
      throw new InvalidValueError(`Origen de pago inválido: ${String(d.origen)}`);
    }
    const ordenes = [...new Set((d.ordenesInformadas ?? []).map((o) => o.trim()).filter(Boolean))];
    return new PagoRecibido(
      d.id,
      referencia,
      d.fecha,
      fechaContable(d.fecha),
      d.valor,
      d.origen,
      d.eventId ?? null,
      ordenes,
    );
  }

  toJSON() {
    return {
      id: this.id,
      referenciaPasarela: this.referenciaPasarela,
      fecha: this.fecha.toISOString(),
      fechaContable: this.fechaContable,
      valor: this.valor.toString(),
      origen: this.origen,
      ordenesInformadas: [...this.ordenesInformadas],
    };
  }
}
