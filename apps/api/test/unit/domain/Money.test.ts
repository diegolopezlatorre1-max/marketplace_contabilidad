import { describe, expect, it } from 'vitest';
import { InvalidValueError, Money, Porcentaje } from '../../../src/domain/shared';

describe('Money', () => {
  it('representa montos con 2 decimales', () => {
    expect(Money.of('100000').toString()).toBe('100000.00');
    expect(Money.of('0.5').toString()).toBe('0.50');
    expect(JSON.stringify({ v: Money.of('12.3') })).toBe('{"v":"12.30"}');
  });

  it('rechaza más de 2 decimales y valores no numéricos', () => {
    expect(() => Money.of('10.001')).toThrow(InvalidValueError);
    expect(() => Money.of('abc')).toThrow(InvalidValueError);
    expect(() => Money.of('Infinity')).toThrow(InvalidValueError);
  });

  it('suma y resta sin errores de coma flotante', () => {
    expect(Money.of('0.1').add(Money.of('0.2')).toString()).toBe('0.30');
    expect(Money.of('100000').subtract(Money.of('10000')).toString()).toBe('90000.00');
    expect(Money.sum([Money.of('90000'), Money.of('45000')]).toString()).toBe('135000.00');
    expect(Money.sum([]).isZero()).toBe(true);
  });

  it('aplica porcentajes con redondeo HALF_UP a 2 decimales', () => {
    expect(Money.of('100000').percentage(Porcentaje.of(10)).toString()).toBe('10000.00');
    // 33.33 * 15 % = 4.9995 -> 5.00
    expect(Money.of('33.33').percentage(Porcentaje.of(15)).toString()).toBe('5.00');
    // 0.05 * 10 % = 0.005 -> 0.01 (HALF_UP)
    expect(Money.of('0.05').percentage(Porcentaje.of(10)).toString()).toBe('0.01');
    // 0.04 * 10 % = 0.004 -> 0.00
    expect(Money.of('0.04').percentage(Porcentaje.of(10)).toString()).toBe('0.00');
  });

  it('mantiene el invariante bruto = comisión + neto calculando el neto por resta', () => {
    const casos = ['100000', '99999.99', '0.01', '12345.67', '33.33', '1'];
    const porcentajes = ['10', '12.5', '7.3333', '15', '0', '100'];
    for (const b of casos) {
      for (const p of porcentajes) {
        const bruto = Money.of(b);
        const comision = bruto.percentage(Porcentaje.of(p));
        const neto = bruto.subtract(comision);
        expect(comision.add(neto).equals(bruto)).toBe(true);
      }
    }
  });

  it('compara montos', () => {
    const a = Money.of('10');
    const b = Money.of('10.00');
    expect(a.equals(b)).toBe(true);
    expect(Money.of('11').greaterThan(a)).toBe(true);
    expect(Money.of('9').lessThan(a)).toBe(true);
    expect(Money.of('9').compare(a)).toBe(-1);
    expect(Money.of('-5').isNegative()).toBe(true);
    expect(Money.of('-5').abs().toString()).toBe('5.00');
    expect(a.negate().toString()).toBe('-10.00');
    expect(a.isPositive()).toBe(true);
  });
});
