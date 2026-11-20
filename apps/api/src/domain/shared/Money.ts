import { D, DECIMALES_MONEDA, type DecimalValue } from './decimal';
import { InvalidValueError } from './DomainError';
import type { Porcentaje } from './Porcentaje';

export const MONEDA = 'COP' as const;

/**
 * Valor monetario en COP con 2 decimales. Inmutable.
 * Nunca se usa `number` para operar dinero (ver docs/adr/0002-dinero-decimal.md).
 */
export class Money {
  private constructor(private readonly valor: DecimalValue) {}

  static readonly CERO = new Money(new D(0));

  /**
   * Construye un monto desde un string decimal ("100000", "100000.50").
   * Rechaza más de 2 decimales: el redondeo solo ocurre en operaciones explícitas.
   */
  static of(valor: string | DecimalValue): Money {
    let decimal: DecimalValue;
    try {
      decimal = valor instanceof D ? valor : new D(valor);
    } catch {
      throw new InvalidValueError(`Monto inválido: ${String(valor)}`);
    }
    if (!decimal.isFinite()) throw new InvalidValueError(`Monto inválido: ${String(valor)}`);
    if (decimal.decimalPlaces() > DECIMALES_MONEDA) {
      throw new InvalidValueError(
        `El monto admite máximo ${DECIMALES_MONEDA} decimales: ${decimal.toString()}`,
      );
    }
    return new Money(decimal);
  }

  static sum(montos: readonly Money[]): Money {
    return montos.reduce((acc, m) => acc.add(m), Money.CERO);
  }

  add(otro: Money): Money {
    return new Money(this.valor.plus(otro.valor));
  }

  subtract(otro: Money): Money {
    return new Money(this.valor.minus(otro.valor));
  }

  /** Aplica un porcentaje y redondea HALF_UP a 2 decimales (p. ej. comisión). */
  percentage(porcentaje: Porcentaje): Money {
    return new Money(
      this.valor.times(porcentaje.fraccion()).toDecimalPlaces(DECIMALES_MONEDA, D.ROUND_HALF_UP),
    );
  }

  negate(): Money {
    return new Money(this.valor.neg());
  }

  abs(): Money {
    return new Money(this.valor.abs());
  }

  isZero(): boolean {
    return this.valor.isZero();
  }

  isPositive(): boolean {
    return this.valor.gt(0);
  }

  isNegative(): boolean {
    return this.valor.lt(0);
  }

  equals(otro: Money): boolean {
    return this.valor.eq(otro.valor);
  }

  greaterThan(otro: Money): boolean {
    return this.valor.gt(otro.valor);
  }

  lessThan(otro: Money): boolean {
    return this.valor.lt(otro.valor);
  }

  compare(otro: Money): -1 | 0 | 1 {
    return this.valor.comparedTo(otro.valor) as -1 | 0 | 1;
  }

  /** Representación canónica con 2 decimales, usada en JSON y en PostgreSQL. */
  toString(): string {
    return this.valor.toFixed(DECIMALES_MONEDA);
  }

  toJSON(): string {
    return this.toString();
  }
}
