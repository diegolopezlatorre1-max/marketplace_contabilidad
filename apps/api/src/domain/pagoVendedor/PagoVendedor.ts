import type { CuentaPorPagar, EstadoCuenta } from '../cuentaPorPagar/cuentaPorPagar';
import { DomainError, InvalidValueError } from '../shared/DomainError';
import { fechaContable, type FechaContable } from '../shared/FechaContable';
import { Money } from '../shared/Money';
import type { Periodo } from '../shared/Periodo';

const MAX_REFERENCIA = 100;
const MAX_SOPORTE = 500;

export class PagoExcedeSaldoError extends DomainError {
  constructor(message: string) {
    super('PAGO_EXCEDE_SALDO', message);
    this.name = 'PagoExcedeSaldoError';
  }
}

/** Parte del pago aplicada a una cuenta (quincena) del vendedor. */
export interface AplicacionPago {
  periodo: Periodo;
  valorAplicado: Money;
  saldoAnterior: Money;
  saldoNuevo: Money;
  estado: EstadoCuenta;
}

export interface RegistrarPagoVendedorDatos {
  id: string;
  vendedorId: string;
  /** Instante del pago (transferencia). */
  fecha: Date;
  /** Valor transferido al vendedor. */
  valor: Money;
  /** Referencia bancaria del pago; única por vendedor. */
  referencia: string;
  /** Soporte del pago (número de comprobante, enlace al archivo...). */
  soporte?: string | undefined;
  /** Cuentas del vendedor con saldo pendiente, bloqueadas para actualizar. */
  cuentas: readonly CuentaPorPagar[];
  /** Saldo a favor del marketplace que aún no se ha descontado (ajustes sobre cuentas pagadas). */
  saldoAFavorDisponible: Money;
  registradoPor: string;
  /** Instante actual: el pago no puede ser futuro. */
  ahora: Date;
}

const menor = (a: Money, b: Money) => (a.lessThan(b) ? a : b);

/**
 * HU-CON-10: pago realizado a un vendedor (D-06, confirmada 2026-11-06).
 * - Primero se descuenta el saldo a favor del marketplace (D-07) y luego se aplica el valor
 *   transferido; ambos van a las cuentas pendientes más antiguas primero (FIFO por periodo).
 * - No permite pagar más de lo que se le debe al vendedor.
 * - Cada cuenta queda PAGADO o PARCIAL según su saldo. Inmutable una vez registrado.
 */
export class PagoVendedor {
  private constructor(
    readonly id: string,
    readonly vendedorId: string,
    readonly fecha: Date,
    readonly fechaContable: FechaContable,
    readonly valor: Money,
    /** Saldo a favor del marketplace que se descontó con este pago. */
    readonly saldoAFavorAplicado: Money,
    readonly referencia: string,
    readonly soporte: string | null,
    readonly aplicaciones: readonly AplicacionPago[],
    readonly registradoPor: string,
  ) {}

  /** Registra el pago y lo aplica a las cuentas recibidas (las modifica). */
  static registrar(d: RegistrarPagoVendedorDatos): PagoVendedor {
    if (!d.vendedorId.trim()) throw new InvalidValueError('El vendedor es obligatorio');
    if (!d.valor.isPositive()) throw new InvalidValueError('El pago debe ser mayor que cero');
    const referencia = d.referencia.trim();
    if (!referencia) throw new InvalidValueError('La referencia del pago es obligatoria');
    if (referencia.length > MAX_REFERENCIA) {
      throw new InvalidValueError(`La referencia admite máximo ${MAX_REFERENCIA} caracteres`);
    }
    const soporte = d.soporte?.trim() || null;
    if (soporte && soporte.length > MAX_SOPORTE) {
      throw new InvalidValueError(`El soporte admite máximo ${MAX_SOPORTE} caracteres`);
    }
    if (Number.isNaN(d.fecha.getTime())) throw new InvalidValueError('Fecha de pago inválida');
    if (fechaContable(d.fecha) > fechaContable(d.ahora)) {
      throw new InvalidValueError('El pago no puede tener fecha futura');
    }
    if (d.saldoAFavorDisponible.isNegative()) {
      throw new InvalidValueError('El saldo a favor no puede ser negativo');
    }
    if (d.cuentas.some((c) => c.vendedorId !== d.vendedorId)) {
      throw new InvalidValueError('Todas las cuentas deben ser del vendedor del pago');
    }

    // FIFO: de la quincena más antigua a la más reciente.
    const pendientes = [...d.cuentas]
      .filter((c) => c.saldoPendiente.isPositive())
      .sort((a, b) => a.periodo.codigo.localeCompare(b.periodo.codigo));
    const deuda = Money.sum(pendientes.map((c) => c.saldoPendiente));
    const descuento = menor(d.saldoAFavorDisponible, deuda);
    const porPagar = deuda.subtract(descuento);
    if (d.valor.greaterThan(porPagar)) {
      throw new PagoExcedeSaldoError(
        `El pago de ${d.valor.toString()} supera lo que se le debe al vendedor ${d.vendedorId}: ` +
          `${porPagar.toString()}` +
          (descuento.isPositive()
            ? ` (saldo ${deuda.toString()} − saldo a favor ${descuento.toString()})`
            : ''),
      );
    }

    let restante = descuento.add(d.valor);
    const aplicaciones: AplicacionPago[] = [];
    for (const cuenta of pendientes) {
      if (!restante.isPositive()) break;
      const saldoAnterior = cuenta.saldoPendiente;
      const valorAplicado = menor(restante, saldoAnterior);
      cuenta.registrarPago(valorAplicado);
      restante = restante.subtract(valorAplicado);
      aplicaciones.push({
        periodo: cuenta.periodo,
        valorAplicado,
        saldoAnterior,
        saldoNuevo: cuenta.saldoPendiente,
        estado: cuenta.estado,
      });
    }

    return new PagoVendedor(
      d.id,
      d.vendedorId,
      d.fecha,
      fechaContable(d.fecha),
      d.valor,
      descuento,
      referencia,
      soporte,
      aplicaciones,
      d.registradoPor,
    );
  }

  toJSON() {
    return {
      id: this.id,
      vendedorId: this.vendedorId,
      fecha: this.fecha.toISOString(),
      fechaContable: this.fechaContable,
      valor: this.valor.toString(),
      saldoAFavorAplicado: this.saldoAFavorAplicado.toString(),
      referencia: this.referencia,
      soporte: this.soporte,
      aplicaciones: this.aplicaciones.map((a) => ({
        periodo: a.periodo.codigo,
        valorAplicado: a.valorAplicado.toString(),
        saldoAnterior: a.saldoAnterior.toString(),
        saldoNuevo: a.saldoNuevo.toString(),
        estado: a.estado,
      })),
      registradoPor: this.registradoPor,
    };
  }
}
