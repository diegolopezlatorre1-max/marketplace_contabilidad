import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AjusteContable,
  AjusteExcedeSaldoError,
  SIN_AJUSTES,
  type AjustesPrevios,
  type RegistrarAjusteDatos,
  type VentaAjustable,
} from '../../../src/domain/ajuste/AjusteContable';
import { ComisionVenta } from '../../../src/domain/comision/ComisionVenta';
import { InvalidValueError } from '../../../src/domain/shared/DomainError';
import { Money } from '../../../src/domain/shared/Money';
import { Porcentaje } from '../../../src/domain/shared/Porcentaje';

const FECHA_VENTA = new Date('2026-10-05T15:00:00Z');
const AHORA = new Date('2026-10-16T15:00:00Z');

function venta(bruto = '100000', porcentaje = '10'): VentaAjustable {
  const c = ComisionVenta.calcular({
    numeroOrden: 'ORD-1',
    vendedorId: 'V-1',
    valorBruto: Money.of(bruto),
    porcentaje: Porcentaje.of(porcentaje),
    calculadaEn: FECHA_VENTA,
  });
  return {
    ventaId: 'venta-1',
    numeroOrden: 'ORD-1',
    vendedorId: 'V-1',
    fecha: FECHA_VENTA,
    valorBruto: c.valorBruto,
    porcentajeAplicado: c.porcentajeAplicado,
    comision: c.comision,
    valorNeto: c.valorNeto,
  };
}

function ajustar(over: Partial<RegistrarAjusteDatos> = {}) {
  return AjusteContable.registrar({
    id: 'aj-1',
    venta: venta(),
    previos: SIN_AJUSTES,
    tipo: 'DEVOLUCION',
    motivo: 'Producto defectuoso',
    fecha: new Date('2026-10-10T15:00:00Z'),
    valor: Money.of('100000'),
    origen: 'MANUAL',
    registradoPor: 'u-contador',
    ahora: AHORA,
    ...over,
  });
}

const sumar = (previos: AjustesPrevios, a: AjusteContable): AjustesPrevios => ({
  valor: previos.valor.add(a.valor),
  comision: previos.comision.add(a.comisionRevertida),
  neto: previos.neto.add(a.netoRevertido),
});

describe('AjusteContable (HU-CON-06, D-07)', () => {
  it('devolución total de 100.000 al 10 % revierte comisión 10.000 y neto 90.000', () => {
    const a = ajustar();
    expect(a.toJSON()).toMatchObject({
      tipo: 'DEVOLUCION',
      motivo: 'Producto defectuoso',
      fechaContable: '2026-10-10',
      periodo: '2026-10-Q1',
      valor: '100000.00',
      porcentajeAplicado: '10.0000',
      comisionRevertida: '10000.00',
      netoRevertido: '90000.00',
      saldoAFavor: '0.00',
    });
  });

  it('devolución parcial: reverso proporcional con el % aplicado originalmente', () => {
    const a = ajustar({ valor: Money.of('30000') });
    expect(a.comisionRevertida.toString()).toBe('3000.00');
    expect(a.netoRevertido.toString()).toBe('27000.00');
  });

  it('parcial + parcial no excede el total y la última cierra exacto', () => {
    const v = venta('100.05', '12.5'); // comisión 12.51, neto 87.54
    const primera = ajustar({ venta: v, valor: Money.of('50.03') });
    const previos = sumar(SIN_AJUSTES, primera);
    const segunda = ajustar({ venta: v, previos, valor: Money.of('50.02') });
    const total = sumar(previos, segunda);
    expect(total.valor.equals(v.valorBruto)).toBe(true);
    expect(total.comision.equals(v.comision)).toBe(true);
    expect(total.neto.equals(v.valorNeto)).toBe(true);
    expect(() => ajustar({ venta: v, previos: total, valor: Money.of('0.01') })).toThrow(
      AjusteExcedeSaldoError,
    );
  });

  it('rechaza un ajuste mayor a lo que queda por ajustar', () => {
    const error = (() => {
      try {
        ajustar({ valor: Money.of('100000.01') });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AjusteExcedeSaldoError);
    expect((error as AjusteExcedeSaldoError).code).toBe('AJUSTE_EXCEDE_SALDO');
  });

  it('la cancelación revierte todo lo no ajustado y no admite otro valor', () => {
    const previos = sumar(SIN_AJUSTES, ajustar({ valor: Money.of('40000') }));
    const c = ajustar({ tipo: 'CANCELACION', valor: undefined, previos });
    expect(c.valor.toString()).toBe('60000.00');
    expect(c.comisionRevertida.toString()).toBe('6000.00');
    expect(() => ajustar({ tipo: 'CANCELACION', valor: Money.of('10'), previos })).toThrow(
      InvalidValueError,
    );
  });

  it('rechaza cancelar una venta ya ajustada por completo', () => {
    const previos = sumar(SIN_AJUSTES, ajustar());
    expect(() => ajustar({ tipo: 'CANCELACION', valor: undefined, previos })).toThrow(
      AjusteExcedeSaldoError,
    );
  });

  it('exige motivo, valor en devoluciones y una fecha entre la venta y hoy', () => {
    expect(() => ajustar({ motivo: '   ' })).toThrow(InvalidValueError);
    expect(() => ajustar({ motivo: 'x'.repeat(501) })).toThrow(InvalidValueError);
    expect(() => ajustar({ valor: undefined })).toThrow(InvalidValueError);
    expect(() => ajustar({ valor: Money.of('0') })).toThrow(InvalidValueError);
    expect(() => ajustar({ fecha: new Date('2026-10-04T15:00:00Z') })).toThrow(
      'anterior a la venta',
    );
    expect(() => ajustar({ fecha: new Date('2026-10-17T15:00:00Z') })).toThrow('futura');
  });

  it('el periodo es la quincena en que ocurre el ajuste, no la de la venta', () => {
    const a = ajustar({ fecha: new Date('2026-10-16T15:00:00Z') });
    expect(a.periodo.codigo).toBe('2026-10-Q2');
  });

  it('conSaldoAFavor no puede superar el neto revertido', () => {
    const a = ajustar({ valor: Money.of('1000') });
    expect(a.conSaldoAFavor(Money.of('900')).saldoAFavor.toString()).toBe('900.00');
    expect(() => a.conSaldoAFavor(Money.of('900.01'))).toThrow(InvalidValueError);
  });

  it('propiedad: devoluciones parciales sucesivas cuadran al centavo con la venta', () => {
    const arbVenta = fc.record({
      centavos: fc.bigInt({ min: 1n, max: 10n ** 10n }),
      diezmilesimas: fc.integer({ min: 0, max: 1_000_000 }),
    });
    const arbCortes = fc.array(fc.double({ min: 0.01, max: 0.99, noNaN: true }), { maxLength: 6 });
    fc.assert(
      fc.property(arbVenta, arbCortes, ({ centavos, diezmilesimas }, cortes) => {
        const bruto = `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`;
        const v = venta(bruto, (diezmilesimas / 10_000).toFixed(4));
        let previos = SIN_AJUSTES;
        for (const corte of cortes) {
          const disponible = v.valorBruto.subtract(previos.valor);
          const parte = (Number(disponible.toString()) * corte).toFixed(2);
          if (!Money.of(parte).isPositive() || !Money.of(parte).lessThan(disponible)) continue;
          const a = ajustar({ venta: v, previos, valor: Money.of(parte) });
          expect(a.comisionRevertida.add(a.netoRevertido).equals(a.valor)).toBe(true);
          expect(a.comisionRevertida.isNegative() || a.netoRevertido.isNegative()).toBe(false);
          previos = sumar(previos, a);
        }
        const cierre = ajustar({ venta: v, previos, tipo: 'CANCELACION', valor: undefined });
        const total = sumar(previos, cierre);
        expect(total.valor.equals(v.valorBruto)).toBe(true);
        expect(total.comision.equals(v.comision)).toBe(true);
        expect(total.neto.equals(v.valorNeto)).toBe(true);
      }),
    );
  });
});
