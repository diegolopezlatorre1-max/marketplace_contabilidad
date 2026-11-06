import { Money } from '../shared/Money';
import type { EstadoCuenta } from './cuentaPorPagar';

/** Movimientos de un vendedor en una quincena (la de sus ventas). Montos en COP. */
export interface MovimientosPeriodo {
  periodo: string;
  ventas: number;
  vendido: Money;
  comision: Money;
  /** Ajustes (HU-CON-06) sobre las ventas de la quincena. */
  ajustes: {
    valor: Money;
    comisionRevertida: Money;
    netoRevertido: Money;
    /** Parte del neto revertido que ya se había pagado: queda a favor del marketplace. */
    saldoAFavor: Money;
  };
  /** Cuenta por pagar de la quincena (HU-CON-03 / HU-CON-10). */
  pagado: Money;
  pendiente: Money;
  estado: EstadoCuenta;
}

export interface TotalesEstado {
  ventas: number;
  vendido: Money;
  comision: Money;
  ajustesValor: Money;
  ajustesComision: Money;
  ajustesNeto: Money;
  /** Ajustes que bajaron el saldo de la cuenta (neto revertido − saldo a favor). */
  ajustesDescontados: Money;
  saldoAFavorGenerado: Money;
  pagado: Money;
  pendiente: Money;
}

export interface ControlEstado {
  cuadra: boolean;
  /** vendido − comisión − ajustes descontados */
  generado: Money;
  /** pagado + pendiente */
  liquidado: Money;
}

const CERO_TOTALES: TotalesEstado = {
  ventas: 0,
  vendido: Money.CERO,
  comision: Money.CERO,
  ajustesValor: Money.CERO,
  ajustesComision: Money.CERO,
  ajustesNeto: Money.CERO,
  ajustesDescontados: Money.CERO,
  saldoAFavorGenerado: Money.CERO,
  pagado: Money.CERO,
  pendiente: Money.CERO,
};

/** Suma los movimientos de las quincenas. */
export function totalizar(periodos: readonly MovimientosPeriodo[]): TotalesEstado {
  return periodos.reduce<TotalesEstado>(
    (t, p) => ({
      ventas: t.ventas + p.ventas,
      vendido: t.vendido.add(p.vendido),
      comision: t.comision.add(p.comision),
      ajustesValor: t.ajustesValor.add(p.ajustes.valor),
      ajustesComision: t.ajustesComision.add(p.ajustes.comisionRevertida),
      ajustesNeto: t.ajustesNeto.add(p.ajustes.netoRevertido),
      ajustesDescontados: t.ajustesDescontados.add(
        p.ajustes.netoRevertido.subtract(p.ajustes.saldoAFavor),
      ),
      saldoAFavorGenerado: t.saldoAFavorGenerado.add(p.ajustes.saldoAFavor),
      pagado: t.pagado.add(p.pagado),
      pendiente: t.pendiente.add(p.pendiente),
    }),
    CERO_TOTALES,
  );
}

/**
 * HU-CON-07, regla de control: total vendido − comisión − ajustes = pagado + pendiente.
 * Los ajustes que cuentan son los que bajaron el saldo de la cuenta; la parte que ya estaba
 * pagada (saldo a favor del marketplace, D-07) se descuenta en el siguiente pago (D-06).
 */
export function control(t: TotalesEstado): ControlEstado {
  const generado = t.vendido.subtract(t.comision).subtract(t.ajustesDescontados);
  const liquidado = t.pagado.add(t.pendiente);
  return { cuadra: generado.equals(liquidado), generado, liquidado };
}
