import type { ComisionVenta } from '../comision/ComisionVenta';
import { InvalidValueError } from '../shared/DomainError';
import { Money } from '../shared/Money';
import { Periodo } from '../shared/Periodo';

export type EstadoCuenta = 'PENDIENTE' | 'PAGADO';

/** Cuenta por pagar a un vendedor en una quincena (vendedor + periodo). */
export class CuentaPorPagar {
  private totalNeto = Money.CERO;
  private pagado = Money.CERO;
  private readonly ordenes = new Set<string>();

  private constructor(
    readonly vendedorId: string,
    readonly periodo: Periodo,
  ) {}

  static abrir(vendedorId: string, periodo: Periodo): CuentaPorPagar {
    if (!vendedorId.trim()) throw new InvalidValueError('El vendedor es obligatorio');
    return new CuentaPorPagar(vendedorId, periodo);
  }

  /** Suma el valor neto de una venta (bruto − comisión) a la cuenta. */
  acumular(comision: ComisionVenta, fechaVenta: Date): void {
    if (comision.vendedorId !== this.vendedorId) {
      throw new InvalidValueError('La venta pertenece a otro vendedor');
    }
    if (!Periodo.fromDate(fechaVenta).equals(this.periodo)) {
      throw new InvalidValueError(`La venta no pertenece al periodo ${this.periodo.codigo}`);
    }
    if (this.ordenes.has(comision.numeroOrden)) {
      throw new InvalidValueError(`La orden ${comision.numeroOrden} ya está en la cuenta`);
    }
    this.ordenes.add(comision.numeroOrden);
    this.totalNeto = this.totalNeto.add(comision.valorNeto);
  }

  /** Pago mínimo para poder probar el estado. HU-CON-10 lo amplía (FIFO, soporte). */
  registrarPago(valor: Money): void {
    if (!valor.isPositive()) throw new InvalidValueError('El pago debe ser mayor que cero');
    if (valor.greaterThan(this.saldoPendiente)) {
      throw new InvalidValueError('El pago supera el saldo pendiente');
    }
    this.pagado = this.pagado.add(valor);
  }

  get saldoPendiente(): Money {
    return this.totalNeto.subtract(this.pagado);
  }

  get estado(): EstadoCuenta {
    return this.totalNeto.isPositive() && this.saldoPendiente.isZero() ? 'PAGADO' : 'PENDIENTE';
  }

  toJSON() {
    return {
      vendedorId: this.vendedorId,
      periodo: this.periodo.codigo,
      totalNeto: this.totalNeto.toString(),
      valorPagado: this.pagado.toString(),
      saldoPendiente: this.saldoPendiente.toString(),
      estado: this.estado,
      ordenes: [...this.ordenes],
    };
  }
}