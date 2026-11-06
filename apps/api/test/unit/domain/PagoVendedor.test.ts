import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CuentaPorPagar } from '../../../src/domain/cuentaPorPagar/cuentaPorPagar';
import {
  PagoExcedeSaldoError,
  PagoVendedor,
  type RegistrarPagoVendedorDatos,
} from '../../../src/domain/pagoVendedor/PagoVendedor';
import { InvalidValueError, Money, Periodo } from '../../../src/domain/shared';

const AHORA = new Date('2026-11-10T15:00:00Z');

/** Cuenta del vendedor en la quincena con un total neto y lo ya pagado. */
function cuenta(periodo: string, totalNeto: string, pagado = '0', vendedorId = 'V-1') {
  return CuentaPorPagar.reconstituir({
    vendedorId,
    periodo: Periodo.parse(periodo),
    totalNeto: Money.of(totalNeto),
    pagado: Money.of(pagado),
    ordenes: [],
  });
}

function pagar(over: Partial<RegistrarPagoVendedorDatos> = {}) {
  return PagoVendedor.registrar({
    id: 'pago-1',
    vendedorId: 'V-1',
    fecha: AHORA,
    valor: Money.of('90000'),
    referencia: 'TRF-1',
    cuentas: [],
    saldoAFavorDisponible: Money.CERO,
    registradoPor: 'u-contador',
    ahora: AHORA,
    ...over,
  });
}

describe('PagoVendedor (HU-CON-10, D-06)', () => {
  it('docx: cuentas de 90.000 y 45.000, un pago de 90.000 deja la primera PAGADA y saldo 45.000', () => {
    const q1 = cuenta('2026-10-Q1', '90000');
    const q2 = cuenta('2026-10-Q2', '45000');
    const pago = pagar({ cuentas: [q2, q1] });

    expect(q1.estado).toBe('PAGADO');
    expect(q2.estado).toBe('PENDIENTE');
    expect(q1.saldoPendiente.add(q2.saldoPendiente).toString()).toBe('45000.00');
    expect(pago.toJSON().aplicaciones).toEqual([
      {
        periodo: '2026-10-Q1',
        valorAplicado: '90000.00',
        saldoAnterior: '90000.00',
        saldoNuevo: '0.00',
        estado: 'PAGADO',
      },
    ]);
  });

  it('aplica FIFO: completa la cuenta más antigua y deja PARCIAL la siguiente', () => {
    const q1 = cuenta('2026-10-Q1', '90000');
    const q2 = cuenta('2026-10-Q2', '45000');
    const pago = pagar({ cuentas: [q1, q2], valor: Money.of('100000') });

    expect(q1.estado).toBe('PAGADO');
    expect(q2.estado).toBe('PARCIAL');
    expect(q2.saldoPendiente.toString()).toBe('35000.00');
    expect(pago.aplicaciones.map((a) => [a.periodo.codigo, a.valorAplicado.toString()])).toEqual([
      ['2026-10-Q1', '90000.00'],
      ['2026-10-Q2', '10000.00'],
    ]);
  });

  it('continúa una cuenta que ya tenía un pago parcial', () => {
    const q1 = cuenta('2026-10-Q1', '90000', '60000');
    pagar({ cuentas: [q1], valor: Money.of('30000') });
    expect(q1.estado).toBe('PAGADO');
  });

  it('rechaza un pago mayor a lo que se le debe al vendedor', () => {
    const q1 = cuenta('2026-10-Q1', '90000');
    expect(() => pagar({ cuentas: [q1], valor: Money.of('90000.01') })).toThrow(
      PagoExcedeSaldoError,
    );
    // La cuenta no se modifica si el pago se rechaza.
    expect(q1.valorPagado.isZero()).toBe(true);
  });

  it('rechaza pagar a un vendedor sin saldo pendiente', () => {
    expect(() => pagar({ cuentas: [cuenta('2026-10-Q1', '90000', '90000')] })).toThrow(
      PagoExcedeSaldoError,
    );
  });

  it('descuenta primero el saldo a favor del marketplace', () => {
    const q1 = cuenta('2026-10-Q1', '90000');
    const q2 = cuenta('2026-10-Q2', '45000');
    // Debe 135.000 y el marketplace tiene 20.000 a favor: se le transfieren 115.000.
    const pago = pagar({
      cuentas: [q1, q2],
      valor: Money.of('115000'),
      saldoAFavorDisponible: Money.of('20000'),
    });
    expect(pago.saldoAFavorAplicado.toString()).toBe('20000.00');
    expect(q1.estado).toBe('PAGADO');
    expect(q2.estado).toBe('PAGADO');
  });

  it('con saldo a favor, el máximo a transferir es la deuda menos el saldo a favor', () => {
    const q1 = cuenta('2026-10-Q1', '90000');
    expect(() =>
      pagar({ cuentas: [q1], valor: Money.of('80000'), saldoAFavorDisponible: Money.of('20000') }),
    ).toThrow(/70000\.00/);
  });

  it('el saldo a favor nunca descuenta más que la deuda', () => {
    const q1 = cuenta('2026-10-Q1', '50000');
    expect(() =>
      pagar({ cuentas: [q1], valor: Money.of('1'), saldoAFavorDisponible: Money.of('80000') }),
    ).toThrow(PagoExcedeSaldoError);
  });

  it('exige valor positivo, referencia y una fecha que no sea futura', () => {
    const cuentas = [cuenta('2026-10-Q1', '90000')];
    expect(() => pagar({ cuentas, valor: Money.CERO })).toThrow(InvalidValueError);
    expect(() => pagar({ cuentas, referencia: '  ' })).toThrow(InvalidValueError);
    expect(() => pagar({ cuentas, fecha: new Date('2026-11-11T15:00:00Z') })).toThrow(
      /fecha futura/,
    );
    expect(() => pagar({ cuentas, soporte: 'x'.repeat(501) })).toThrow(InvalidValueError);
  });

  it('rechaza cuentas de otro vendedor', () => {
    expect(() => pagar({ cuentas: [cuenta('2026-10-Q1', '90000', '0', 'V-2')] })).toThrow(
      InvalidValueError,
    );
  });

  it('guarda la referencia y el soporte sin espacios sobrantes', () => {
    const pago = pagar({
      cuentas: [cuenta('2026-10-Q1', '90000')],
      referencia: ' TRF-9 ',
      soporte: '  ',
    });
    expect(pago.referencia).toBe('TRF-9');
    expect(pago.soporte).toBeNull();
  });

  it('propiedad: lo aplicado a las cuentas es igual al pago más el saldo a favor descontado', () => {
    const centavos = fc.integer({ min: 1, max: 50_000_000 });
    fc.assert(
      fc.property(
        fc.array(centavos, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        (netos, aFavor, fraccion) => {
          const cuentas = netos.map((n, i) =>
            cuenta(`2026-${String(i + 1).padStart(2, '0')}-Q1`, (n / 100).toFixed(2)),
          );
          const deuda = Money.sum(cuentas.map((c) => c.saldoPendiente));
          const saldoAFavor = Money.of((aFavor / 100).toFixed(2));
          const descuento = saldoAFavor.greaterThan(deuda) ? deuda : saldoAFavor;
          const maximo = deuda.subtract(descuento);
          if (!maximo.isPositive()) return;
          const centavosMax = Math.round(Number(maximo.toString()) * 100);
          const valor = Money.of(
            (Math.max(1, Math.floor(centavosMax * fraccion)) / 100).toFixed(2),
          );

          const pago = pagar({ cuentas, valor, saldoAFavorDisponible: saldoAFavor });
          const aplicado = Money.sum(pago.aplicaciones.map((a) => a.valorAplicado));
          expect(aplicado.equals(valor.add(pago.saldoAFavorAplicado))).toBe(true);
          expect(
            Money.sum(cuentas.map((c) => c.saldoPendiente)).equals(deuda.subtract(aplicado)),
          ).toBe(true);
          // FIFO: ninguna cuenta recibe pago si una más antigua sigue con saldo.
          const conSaldo = cuentas.findIndex((c) => c.saldoPendiente.isPositive());
          if (conSaldo >= 0) {
            cuentas.slice(conSaldo + 1).forEach((c) => expect(c.valorPagado.isZero()).toBe(true));
          }
        },
      ),
    );
  });
});
