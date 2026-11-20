import { InvalidValueError } from '../shared/DomainError';
import type { Money } from '../shared/Money';
import type { Porcentaje } from '../shared/Porcentaje';

export interface CalcularComisionEntrada {
  numeroOrden: string;
  vendedorId: string;
  valorBruto: Money;
  /** Porcentaje vigente en la fecha de la venta (lo entrega HU-CON-09). */
  porcentaje: Porcentaje;
  calculadaEn: Date;
}

/**
 * Resultado del cálculo de comisión de UNA línea de orden (orden + vendedor).
 * Inmutable: una vez calculada, no cambia aunque el porcentaje se modifique después.
 */
export class ComisionVenta {
  private constructor(
    readonly numeroOrden: string,
    readonly vendedorId: string,
    readonly valorBruto: Money,
    readonly porcentajeAplicado: Porcentaje,
    readonly comision: Money,
    readonly valorNeto: Money,
    readonly calculadaEn: Date,
  ) {}

  static calcular(entrada: CalcularComisionEntrada): ComisionVenta {
    if (!entrada.valorBruto.isPositive()) {
      throw new InvalidValueError(
        `El valor bruto debe ser mayor que cero: ${entrada.valorBruto.toString()}`,
      );
    }
    const comision = entrada.valorBruto.percentage(entrada.porcentaje);
    const valorNeto = entrada.valorBruto.subtract(comision);

    return new ComisionVenta(
      entrada.numeroOrden,
      entrada.vendedorId,
      entrada.valorBruto,
      entrada.porcentaje,
      comision,
      valorNeto,
      entrada.calculadaEn,
    );
  }

  toJSON() {
    return {
      numeroOrden: this.numeroOrden,
      vendedorId: this.vendedorId,
      valorBruto: this.valorBruto.toString(),
      porcentajeAplicado: this.porcentajeAplicado.toString(),
      comision: this.comision.toString(),
      valorNeto: this.valorNeto.toString(),
      calculadaEn: this.calculadaEn.toISOString(),
    };
  }
}
