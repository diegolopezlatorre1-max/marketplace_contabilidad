import { describe, expect, it } from 'vitest';
import { esMontoValido, normalizarMonto, vistaPrevia } from './calculos';

describe('vistaPrevia', () => {
  it('pago de 150.000 contra 100.000 + 50.000 -> CONCILIADA', () => {
    expect(vistaPrevia('150000.00', ['100000', '50000'])).toEqual({
      aplicado: '150000.00',
      diferencia: '0.00',
      estado: 'CONCILIADA',
    });
  });

  it('pago de 95.000 contra 100.000 -> -5.000 PENDIENTE', () => {
    expect(vistaPrevia('95000.00', ['100000'])).toEqual({
      aplicado: '100000.00',
      diferencia: '-5000.00',
      estado: 'PENDIENTE',
    });
  });

  it('acepta coma decimal y centavos', () => {
    expect(vistaPrevia('100.50', ['100,50'])?.estado).toBe('CONCILIADA');
  });

  it('no calcula si falta algún valor o es inválido', () => {
    expect(vistaPrevia('100.00', ['50', ''])).toBeNull();
    expect(vistaPrevia('100.00', ['abc'])).toBeNull();
    expect(vistaPrevia('100.00', [])).toBeNull();
  });
});

describe('montos', () => {
  it('normaliza y valida', () => {
    expect(normalizarMonto(' 100,5 ')).toBe('100.5');
    expect(esMontoValido('0')).toBe(false);
    expect(esMontoValido('1.234')).toBe(false);
    expect(esMontoValido('1234.5')).toBe(true);
  });
});
