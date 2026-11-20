import { describe, expect, it } from 'vitest';
import { InvalidValueError, Porcentaje } from '../../../src/domain/shared';

describe('Porcentaje', () => {
  it('acepta valores entre 0 y 100 con hasta 4 decimales', () => {
    expect(Porcentaje.of(10).toString()).toBe('10.0000');
    expect(Porcentaje.of('12.5').toString()).toBe('12.5000');
    expect(Porcentaje.of('0').toString()).toBe('0.0000');
    expect(Porcentaje.of('100').toString()).toBe('100.0000');
    expect(Porcentaje.of('7.3333').fraccion().toString()).toBe('0.073333');
  });

  it('rechaza valores fuera de rango o con demasiados decimales', () => {
    expect(() => Porcentaje.of(-1)).toThrow(InvalidValueError);
    expect(() => Porcentaje.of('100.01')).toThrow(InvalidValueError);
    expect(() => Porcentaje.of('10.12345')).toThrow(InvalidValueError);
    expect(() => Porcentaje.of('diez')).toThrow(InvalidValueError);
  });

  it('compara por valor', () => {
    expect(Porcentaje.of('10').equals(Porcentaje.of('10.0'))).toBe(true);
    expect(Porcentaje.of('10').equals(Porcentaje.of('12'))).toBe(false);
  });
});
