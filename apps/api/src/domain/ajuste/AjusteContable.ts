import { DomainError, InvalidValueError } from '../shared/DomainError';
import { fechaContable, type FechaContable } from '../shared/FechaContable';
import { Money } from '../shared/Money';
import { Periodo } from '../shared/Periodo';
import type { Porcentaje } from '../shared/Porcentaje';

export const TIPOS_AJUSTE = ['DEVOLUCION', 'CANCELACION'] as const;
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number];
export type OrigenAjuste = 'MANUAL' | 'EVENTO';

const MAX_MOTIVO = 500;

/** El ajuste supera lo que queda por ajustar de la venta (D-07). */
export class AjusteExcedeSaldoError extends DomainError {
  constructor(message: string) {
    super('AJUSTE_EXCEDE_SALDO', message);
    this.name = 'AjusteExcedeSaldoError';
  }
}

/** Venta que se ajusta, con su comisión original (snapshot de HU-CON-02). */
export interface VentaAjustable {
  ventaId: string;
  numeroOrden: string;
  vendedorId: string;
  fecha: Date;
  valorBruto: Money;
  porcentajeAplicado: Porcentaje;
  comision: Money;
  valorNeto: Money;
}

/** Suma de los ajustes ya registrados sobre la venta. */
export interface AjustesPrevios {
  valor: Money;
  comision: Money;
  neto: Money;
}

export const SIN_AJUSTES: AjustesPrevios = {
  valor: Money.CERO,
  comision: Money.CERO,
  neto: Money.CERO,
};

export interface RegistrarAjusteDatos {
  id: string;
  venta: VentaAjustable;
  previos: AjustesPrevios;
  tipo: TipoAjuste;
  motivo: string;
  /** Instante del ajuste (devolución o cancelación). */
  fecha: Date;
  /** Obligatorio en DEVOLUCION; en CANCELACION se toma todo lo no ajustado. */
  valor?: Money | undefined;
  origen: OrigenAjuste;
  eventId?: string | undefined;
  registradoPor: string;
  /** Instante actual: el ajuste no puede ser futuro. */
  ahora: Date;
}

const menor = (a: Money, b: Money) => (a.lessThan(b) ? a : b);
const mayor = (a: Money, b: Money) => (a.greaterThan(b) ? a : b);

/**
 * HU-CON-06: ajuste por devolución o cancelación de una venta (política D-07, provisional).
 * - Solo sobre ventas existentes y hasta el valor no ajustado (devoluciones parciales).
 * - Reverso proporcional con el % aplicado originalmente; el ajuste que completa el total
 *   revierte exactamente lo que falta, así la suma de ajustes cuadra con la venta.
 * - Nunca modifica la venta original. Inmutable.
 */
export class AjusteContable {
  private constructor(
    readonly id: string,
    readonly ventaId: string,
    readonly numeroOrden: string,
    readonly vendedorId: string,
    readonly tipo: TipoAjuste,
    readonly motivo: string,
    readonly fecha: Date,
    readonly fechaContable: FechaContable,
    /** Quincena en que ocurre el ajuste (la usa el reporte de HU-CON-05). */
    readonly periodo: Periodo,
    readonly valor: Money,
    readonly porcentajeAplicado: Porcentaje,
    readonly comisionRevertida: Money,
    readonly netoRevertido: Money,
    /** Parte del neto revertido que ya se había pagado al vendedor (D-07). */
    readonly saldoAFavor: Money,
    readonly origen: OrigenAjuste,
    readonly eventId: string | null,
    readonly registradoPor: string,
  ) {}

  static registrar(d: RegistrarAjusteDatos): AjusteContable {
    const motivo = d.motivo.trim();
    if (!motivo) throw new InvalidValueError('El motivo del ajuste es obligatorio');
    if (motivo.length > MAX_MOTIVO) {
      throw new InvalidValueError(`El motivo admite máximo ${MAX_MOTIVO} caracteres`);
    }
    if (Number.isNaN(d.fecha.getTime())) throw new InvalidValueError('Fecha de ajuste inválida');
    if (fechaContable(d.fecha) < fechaContable(d.venta.fecha)) {
      throw new InvalidValueError('El ajuste no puede ser anterior a la venta');
    }
    if (fechaContable(d.fecha) > fechaContable(d.ahora)) {
      throw new InvalidValueError('El ajuste no puede tener fecha futura');
    }

    const disponible = d.venta.valorBruto.subtract(d.previos.valor);
    if (!disponible.isPositive()) {
      throw new AjusteExcedeSaldoError(
        `La venta ${d.venta.numeroOrden} del vendedor ${d.venta.vendedorId} ya está ajustada por completo`,
      );
    }
    const valor = AjusteContable.valorDelAjuste(d.tipo, d.valor, disponible);

    // Lo que queda por revertir de la comisión y del neto originales.
    const comisionRestante = d.venta.comision.subtract(d.previos.comision);
    const netoRestante = d.venta.valorNeto.subtract(d.previos.neto);
    let comisionRevertida: Money;
    if (valor.equals(disponible)) {
      comisionRevertida = comisionRestante;
    } else {
      // Proporcional y acotada: ni más comisión ni más neto de los que quedan.
      const proporcional = valor.percentage(d.venta.porcentajeAplicado);
      comisionRevertida = menor(
        mayor(proporcional, valor.subtract(netoRestante)),
        comisionRestante,
      );
    }
    const netoRevertido = valor.subtract(comisionRevertida);

    return new AjusteContable(
      d.id,
      d.venta.ventaId,
      d.venta.numeroOrden,
      d.venta.vendedorId,
      d.tipo,
      motivo,
      d.fecha,
      fechaContable(d.fecha),
      Periodo.fromDate(d.fecha),
      valor,
      d.venta.porcentajeAplicado,
      comisionRevertida,
      netoRevertido,
      Money.CERO,
      d.origen,
      d.eventId ?? null,
      d.registradoPor,
    );
  }

  private static valorDelAjuste(
    tipo: TipoAjuste,
    valor: Money | undefined,
    disponible: Money,
  ): Money {
    if (tipo === 'CANCELACION') {
      if (valor && !valor.equals(disponible)) {
        throw new InvalidValueError(
          `La cancelación revierte todo el valor no ajustado (${disponible.toString()})`,
        );
      }
      return disponible;
    }
    if (!valor) throw new InvalidValueError('La devolución requiere el valor devuelto');
    if (!valor.isPositive())
      throw new InvalidValueError('El valor devuelto debe ser mayor que cero');
    if (valor.greaterThan(disponible)) {
      throw new AjusteExcedeSaldoError(
        `El valor devuelto (${valor.toString()}) supera lo que queda por ajustar (${disponible.toString()})`,
      );
    }
    return valor;
  }

  /** Copia con la parte ya pagada al vendedor que queda como saldo a favor del marketplace. */
  conSaldoAFavor(saldo: Money): AjusteContable {
    if (saldo.isNegative() || saldo.greaterThan(this.netoRevertido)) {
      throw new InvalidValueError('El saldo a favor no puede superar el neto revertido');
    }
    return new AjusteContable(
      this.id,
      this.ventaId,
      this.numeroOrden,
      this.vendedorId,
      this.tipo,
      this.motivo,
      this.fecha,
      this.fechaContable,
      this.periodo,
      this.valor,
      this.porcentajeAplicado,
      this.comisionRevertida,
      this.netoRevertido,
      saldo,
      this.origen,
      this.eventId,
      this.registradoPor,
    );
  }

  toJSON() {
    return {
      id: this.id,
      ventaId: this.ventaId,
      numeroOrden: this.numeroOrden,
      vendedorId: this.vendedorId,
      tipo: this.tipo,
      motivo: this.motivo,
      fecha: this.fecha.toISOString(),
      fechaContable: this.fechaContable,
      periodo: this.periodo.codigo,
      valor: this.valor.toString(),
      porcentajeAplicado: this.porcentajeAplicado.toString(),
      comisionRevertida: this.comisionRevertida.toString(),
      netoRevertido: this.netoRevertido.toString(),
      saldoAFavor: this.saldoAFavor.toString(),
      origen: this.origen,
      eventId: this.eventId,
      registradoPor: this.registradoPor,
    };
  }
}
