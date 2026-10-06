import { describe, expect, it } from 'vitest';
import { formatearFechaHora, formatearMoneda } from './format';

// Intl usa espacios no separables: se normalizan para comparar.
const normalizar = (s: string) => s.replace(/\s/g, ' ');

describe('formatearMoneda', () => {
  it('formatea montos en pesos colombianos', () => {
    expect(normalizar(formatearMoneda('100000.00'))).toBe('$ 100.000,00');
    expect(normalizar(formatearMoneda('-5000'))).toBe('-$ 5.000,00');
  });

  it('devuelve el valor original si no es un monto válido', () => {
    expect(formatearMoneda('abc')).toBe('abc');
  });
});

describe('formatearFechaHora', () => {
  it('muestra la fecha en hora de Colombia', () => {
    expect(formatearFechaHora('2026-10-05T15:00:00Z')).toContain('2026');
  });

  it('devuelve el valor original si la fecha es inválida', () => {
    expect(formatearFechaHora('no-fecha')).toBe('no-fecha');
  });
});
