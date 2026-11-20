import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ComisionVenta } from '../../../src/domain/comision/ComisionVenta';
import { InvalidValueError } from '../../../src/domain/shared/DomainError';
import { Money } from '../../../src/domain/shared/Money';
import { Porcentaje } from '../../../src/domain/shared/Porcentaje';

const FECHA = new Date('2026-10-12T10:00:00Z');

function calcular(bruto: string, porcentaje: string) {
  return ComisionVenta.calcular({
    numeroOrden: 'ORD-1',
    vendedorId: 'V-1',
    valorBruto: Money.of(bruto),
    porcentaje: Porcentaje.of(porcentaje),
    calculadaEn: FECHA,
  });
}

describe('ComisionVenta', () => {
  it('escenario 1: venta de 100000 al 10 % -> comisión 10000 y neto 90000', () => {
    const r = calcular('100000', '10');
    expect(r.valorBruto.toString()).toBe('100000.00');
    expect(r.comision.toString()).toBe('10000.00');
    expect(r.valorNeto.toString()).toBe('90000.00');
  });

  it('escenario 2: un cambio de porcentaje no altera una comisión ya calculada', () => {
    const antes = calcular('100000', '10');
    const despues = calcular('100000', '12');
    expect(antes.porcentajeAplicado.toString()).toBe('10.0000');
    expect(antes.comision.toString()).toBe('10000.00');
    expect(despues.comision.toString()).toBe('12000.00');
  });

  it('escenario 3: con decimales redondea HALF_UP y bruto = comisión + neto', () => {
    const r = calcular('100.05', '12.5'); // 12.50625 -> 12.51
    expect(r.comision.toString()).toBe('12.51');
    expect(r.valorNeto.toString()).toBe('87.54');
    expect(r.comision.add(r.valorNeto).equals(r.valorBruto)).toBe(true);
  });

  it('redondea hacia arriba justo en la mitad (0.005 -> 0.01)', () => {
    const r = calcular('0.05', '10');
    expect(r.comision.toString()).toBe('0.01');
    expect(r.valorNeto.toString()).toBe('0.04');
  });

  it('con porcentaje 0 la comisión es 0 y el neto es el bruto', () => {
    const r = calcular('5000', '0');
    expect(r.comision.isZero()).toBe(true);
    expect(r.valorNeto.equals(r.valorBruto)).toBe(true);
  });

  it('rechaza un valor bruto de cero', () => {
    expect(() => calcular('0', '10')).toThrow(InvalidValueError);
  });

  it('propiedad: para cualquier bruto y porcentaje, bruto = comisión + neto y nada es negativo', () => {
    // Bruto en centavos (0,01 a 10^12) y porcentaje con hasta 4 decimales (0 a 100).
    const bruto = fc.bigInt({ min: 1n, max: 10n ** 14n });
    const porcentaje = fc.integer({ min: 0, max: 1_000_000 });
    fc.assert(
      fc.property(bruto, porcentaje, (centavos, diezmilesimas) => {
        const brutoTexto = `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`;
        const r = calcular(brutoTexto, (diezmilesimas / 10_000).toFixed(4));
        expect(r.comision.add(r.valorNeto).equals(r.valorBruto)).toBe(true);
        expect(r.comision.isNegative()).toBe(false);
        expect(r.valorNeto.isNegative()).toBe(false);
      }),
    );
  });

  it('toJSON entrega todo como texto con el porcentaje aplicado', () => {
    expect(calcular('100000', '10').toJSON()).toMatchObject({
      numeroOrden: 'ORD-1',
      vendedorId: 'V-1',
      porcentajeAplicado: '10.0000',
      comision: '10000.00',
      valorNeto: '90000.00',
    });
  });
});
