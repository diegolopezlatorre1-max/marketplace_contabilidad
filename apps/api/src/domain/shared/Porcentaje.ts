import { D, DECIMALES_PORCENTAJE, type DecimalValue } from './decimal';
import { InvalidValueError } from './DomainError';

/** Porcentaje entre 0 y 100 con máximo 4 decimales (p. ej. 10, 12.5, 7.25). */
export class Porcentaje {
  private constructor(private readonly valor: DecimalValue) {}

  static of(valor: string | number): Porcentaje {
    let decimal: DecimalValue;
    try {
      decimal = new D(valor);
    } catch {
      throw new InvalidValueError(`Porcentaje inválido: ${String(valor)}`);
    }
    if (!decimal.isFinite()) throw new InvalidValueError(`Porcentaje inválido: ${String(valor)}`);
    if (decimal.lt(0) || decimal.gt(100)) {
      throw new InvalidValueError(`El porcentaje debe estar entre 0 y 100: ${decimal.toString()}`);
    }
    if (decimal.decimalPlaces() > DECIMALES_PORCENTAJE) {
      throw new InvalidValueError(
        `El porcentaje admite máximo ${DECIMALES_PORCENTAJE} decimales: ${decimal.toString()}`,
      );
    }
    return new Porcentaje(decimal);
  }

  /** Fracción para multiplicar (10 % -> 0.1). */
  fraccion(): DecimalValue {
    return this.valor.div(100);
  }

  equals(otro: Porcentaje): boolean {
    return this.valor.eq(otro.valor);
  }

  toString(): string {
    return this.valor.toFixed(DECIMALES_PORCENTAJE);
  }

  toJSON(): string {
    return this.toString();
  }
}
