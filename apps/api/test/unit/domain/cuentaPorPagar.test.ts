import { describe, expect, it } from 'vitest';
import { ComisionVenta } from '../../../src/domain/comision/ComisionVenta';
import { CuentaPorPagar } from '../../../src/domain/cuentaPorPagar/cuentaPorPagar';
import { InvalidValueError } from '../../../src/domain/shared/DomainError';
import { Money } from '../../../src/domain/shared/Money';
import { Periodo } from '../../../src/domain/shared/Periodo';
import { Porcentaje } from '../../../src/domain/shared/Porcentaje';

const Q1 = Periodo.parse('2026-10-Q1');
const VENTA_Q1 = new Date('2026-10-05T15:00:00Z');
const VENTA_Q2 = new Date('2026-10-20T15:00:00Z');

function comision(orden: string, bruto: string, vendedor = 'V-1') {
  return ComisionVenta.calcular({
    numeroOrden: orden,
    vendedorId: vendedor,
    valorBruto: Money.of(bruto),
    porcentaje: Porcentaje.of('10'),
    calculadaEn: VENTA_Q1,
  });
}

describe('CuentaPorPagar', () => {
  it('identifica vendedor y periodo', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    expect(c.vendedorId).toBe('V-1');
    expect(c.periodo.codigo).toBe('2026-10-Q1');
  });

  it('calcula el pendiente después de la comisión', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    c.acumular(comision('ORD-1', '100000'), VENTA_Q1);
    c.acumular(comision('ORD-2', '50000'), VENTA_Q1);
    expect(c.saldoPendiente.toString()).toBe('135000.00');
    expect(c.estado).toBe('PENDIENTE');
  });

  it('pasa a PAGADO solo cuando el saldo llega a cero', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    c.acumular(comision('ORD-1', '100000'), VENTA_Q1);
    c.registrarPago(Money.of('40000'));
    expect(c.saldoPendiente.toString()).toBe('50000.00');
    expect(c.estado).toBe('PENDIENTE');
    c.registrarPago(Money.of('50000'));
    expect(c.estado).toBe('PAGADO');
  });

  it('una cuenta sin ventas está PENDIENTE con saldo 0', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    expect(c.saldoPendiente.isZero()).toBe(true);
    expect(c.estado).toBe('PENDIENTE');
  });

  it('rechaza una orden repetida', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    c.acumular(comision('ORD-1', '1000'), VENTA_Q1);
    expect(() => c.acumular(comision('ORD-1', '1000'), VENTA_Q1)).toThrow(InvalidValueError);
  });

  it('rechaza una venta de otro vendedor', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    expect(() => c.acumular(comision('ORD-1', '1000', 'V-2'), VENTA_Q1)).toThrow(
      InvalidValueError,
    );
  });

  it('rechaza una venta de otra quincena', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    expect(() => c.acumular(comision('ORD-1', '1000'), VENTA_Q2)).toThrow(InvalidValueError);
  });

  it('rechaza un pago mayor al saldo o en cero', () => {
    const c = CuentaPorPagar.abrir('V-1', Q1);
    c.acumular(comision('ORD-1', '1000'), VENTA_Q1);
    expect(() => c.registrarPago(Money.of('901'))).toThrow(InvalidValueError);
    expect(() => c.registrarPago(Money.CERO)).toThrow(InvalidValueError);
  });
});