import { DomainError, InvalidValueError } from '../shared/DomainError';
import { fechaContable, type FechaContable } from '../shared/FechaContable';
import type { Money } from '../shared/Money';
import { Periodo } from '../shared/Periodo';

/** Único estado de orden que genera registro contable (supuesto S-02). */
export const ESTADO_CONFIRMADA = 'CONFIRMADA';

export class OrdenNoConfirmadaError extends DomainError {
  constructor(numeroOrden: string, estado: string) {
    super(
      'ORDEN_NO_CONFIRMADA',
      `La orden ${numeroOrden} está en estado ${estado}: solo se registran órdenes ${ESTADO_CONFIRMADA}`,
    );
    this.name = 'OrdenNoConfirmadaError';
  }
}

/** La misma orden ya se registró para el vendedor (con otro eventId). */
export class OrdenDuplicadaError extends DomainError {
  constructor(numeroOrden: string, vendedorId: string) {
    super(
      'ORDEN_DUPLICADA',
      `La orden ${numeroOrden} ya está registrada para el vendedor ${vendedorId}`,
    );
    this.name = 'OrdenDuplicadaError';
  }
}

export interface RegistrarVentaDatos {
  id: string;
  numeroOrden: string;
  vendedorId: string;
  categoriaId?: string | undefined;
  /** Instante de la orden (con zona horaria). */
  fecha: Date;
  valorBruto: Money;
  estadoOrigen: string;
}

/**
 * Venta registrada contablemente: una por (orden, vendedor) (D-05).
 * Inmutable: las correcciones se hacen con ajustes (HU-CON-06).
 */
export class VentaContable {
  private constructor(
    readonly id: string,
    readonly numeroOrden: string,
    readonly vendedorId: string,
    readonly categoriaId: string | null,
    readonly fecha: Date,
    readonly fechaContable: FechaContable,
    readonly periodo: Periodo,
    readonly valorBruto: Money,
    readonly estadoOrigen: string,
  ) {}

  static registrar(d: RegistrarVentaDatos): VentaContable {
    if (d.estadoOrigen !== ESTADO_CONFIRMADA) {
      throw new OrdenNoConfirmadaError(d.numeroOrden, d.estadoOrigen);
    }
    if (!d.numeroOrden.trim()) throw new InvalidValueError('El número de orden es obligatorio');
    if (!d.vendedorId.trim()) throw new InvalidValueError('El vendedor es obligatorio');
    if (!d.valorBruto.isPositive()) {
      throw new InvalidValueError(
        `El valor bruto debe ser mayor que cero: ${d.valorBruto.toString()}`,
      );
    }
    return new VentaContable(
      d.id,
      d.numeroOrden,
      d.vendedorId,
      d.categoriaId ?? null,
      d.fecha,
      // Día y quincena se determinan en hora de Colombia (D-03).
      fechaContable(d.fecha),
      Periodo.fromDate(d.fecha),
      d.valorBruto,
      d.estadoOrigen,
    );
  }

  toJSON() {
    return {
      id: this.id,
      numeroOrden: this.numeroOrden,
      vendedorId: this.vendedorId,
      categoriaId: this.categoriaId,
      fecha: this.fecha.toISOString(),
      fechaContable: this.fechaContable,
      periodo: this.periodo.codigo,
      valorBruto: this.valorBruto.toString(),
      estadoOrigen: this.estadoOrigen,
    };
  }
}
