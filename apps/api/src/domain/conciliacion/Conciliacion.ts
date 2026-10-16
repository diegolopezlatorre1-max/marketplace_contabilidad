import { DomainError, InvalidValueError } from '../shared/DomainError';
import { Money } from '../shared/Money';
import type { PagoRecibido } from './PagoRecibido';

export const ESTADOS_CONCILIACION = ['CONCILIADA', 'PENDIENTE'] as const;
export type EstadoConciliacion = (typeof ESTADOS_CONCILIACION)[number];

export class OrdenInexistenteError extends DomainError {
  constructor(numeroOrden: string) {
    super('ORDEN_INEXISTENTE', `No hay ventas registradas para la orden ${numeroOrden}`);
    this.name = 'OrdenInexistenteError';
  }
}

export class ConciliacionDuplicadaError extends DomainError {
  constructor(referencia: string) {
    super('CONCILIACION_DUPLICADA', `El pago ${referencia} ya está conciliado`);
    this.name = 'ConciliacionDuplicadaError';
  }
}

export class AplicadoExcedeSaldoError extends DomainError {
  constructor(numeroOrden: string, aplicado: Money, saldo: Money) {
    super(
      'APLICADO_EXCEDE_SALDO',
      `A la orden ${numeroOrden} se le quieren aplicar ${aplicado.toString()} y su saldo ` +
        `por conciliar es ${saldo.toString()}`,
    );
    this.name = 'AplicadoExcedeSaldoError';
  }
}

/** Valor de una orden y lo que ya se le aplicó en otras conciliaciones. */
export interface OrdenPorConciliar {
  numeroOrden: string;
  valorOrden: Money;
  valorYaAplicado: Money;
}

export interface DetalleConciliacion {
  numeroOrden: string;
  valorOrden: Money;
  valorAplicado: Money;
}

/**
 * Regla de conciliación (D-08, provisional): diferencia = pago - aplicado;
 * |diferencia| <= tolerancia -> CONCILIADA, si no -> PENDIENTE.
 */
export class PoliticaConciliacion {
  constructor(readonly tolerancia: Money = Money.CERO) {
    if (tolerancia.isNegative()) throw new InvalidValueError('La tolerancia no puede ser negativa');
  }

  evaluar(
    valorPago: Money,
    valorAplicado: Money,
  ): { diferencia: Money; estado: EstadoConciliacion } {
    const diferencia = valorPago.subtract(valorAplicado);
    return {
      diferencia,
      estado: diferencia.abs().greaterThan(this.tolerancia) ? 'PENDIENTE' : 'CONCILIADA',
    };
  }
}

export interface ConciliarDatos {
  id: string;
  pago: PagoRecibido;
  /** Cada orden con su información y, opcionalmente, el valor a aplicar. */
  ordenes: ReadonlyArray<{ orden: OrdenPorConciliar; valorAplicado?: Money | undefined }>;
  politica: PoliticaConciliacion;
  usuario: string;
  fecha: Date;
}

/** Relación de un pago recibido con las órdenes que paga (HU-CON-04). Inmutable. */
export class Conciliacion {
  private constructor(
    readonly id: string,
    readonly pago: PagoRecibido,
    readonly detalles: readonly DetalleConciliacion[],
    readonly valorAplicado: Money,
    readonly diferencia: Money,
    readonly estado: EstadoConciliacion,
    readonly usuario: string,
    readonly fecha: Date,
  ) {}

  static conciliar(d: ConciliarDatos): Conciliacion {
    if (d.ordenes.length === 0) {
      throw new InvalidValueError('Indique al menos una orden para conciliar el pago');
    }
    const vistas = new Set<string>();
    const detalles = d.ordenes.map(({ orden, valorAplicado }) => {
      if (vistas.has(orden.numeroOrden)) {
        throw new InvalidValueError(`La orden ${orden.numeroOrden} está repetida`);
      }
      vistas.add(orden.numeroOrden);
      const saldo = orden.valorOrden.subtract(orden.valorYaAplicado);
      // Sin valor indicado se aplica todo el saldo pendiente de la orden.
      const aplicado = valorAplicado ?? saldo;
      if (!aplicado.isPositive()) {
        throw saldo.isPositive()
          ? new InvalidValueError(
              `El valor aplicado a ${orden.numeroOrden} debe ser mayor que cero`,
            )
          : new AplicadoExcedeSaldoError(orden.numeroOrden, aplicado, saldo);
      }
      if (aplicado.greaterThan(saldo)) {
        throw new AplicadoExcedeSaldoError(orden.numeroOrden, aplicado, saldo);
      }
      return {
        numeroOrden: orden.numeroOrden,
        valorOrden: orden.valorOrden,
        valorAplicado: aplicado,
      };
    });

    const totalAplicado = Money.sum(detalles.map((x) => x.valorAplicado));
    const { diferencia, estado } = d.politica.evaluar(d.pago.valor, totalAplicado);
    return new Conciliacion(
      d.id,
      d.pago,
      detalles,
      totalAplicado,
      diferencia,
      estado,
      d.usuario,
      d.fecha,
    );
  }

  toJSON() {
    return {
      id: this.id,
      pagoId: this.pago.id,
      referenciaPasarela: this.pago.referenciaPasarela,
      valorPago: this.pago.valor.toString(),
      valorAplicado: this.valorAplicado.toString(),
      diferencia: this.diferencia.toString(),
      estado: this.estado,
      usuario: this.usuario,
      fecha: this.fecha.toISOString(),
      detalles: this.detalles.map((x) => ({
        numeroOrden: x.numeroOrden,
        valorOrden: x.valorOrden.toString(),
        valorAplicado: x.valorAplicado.toString(),
      })),
    };
  }
}
