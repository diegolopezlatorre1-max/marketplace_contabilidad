import { describe, expect, it } from 'vitest';
import {
  diaAnterior,
  fechaContable,
  InvalidValueError,
  parseFechaContable,
} from '../../../src/domain/shared';

describe('FechaContable', () => {
  it('acepta fechas reales AAAA-MM-DD', () => {
    expect(parseFechaContable('2026-10-16')).toBe('2026-10-16');
    expect(parseFechaContable('2028-02-29')).toBe('2028-02-29');
  });

  it('rechaza formatos o fechas inexistentes', () => {
    expect(() => parseFechaContable('2026-02-30')).toThrow(InvalidValueError);
    expect(() => parseFechaContable('2026-13-01')).toThrow(InvalidValueError);
    expect(() => parseFechaContable('16/10/2026')).toThrow(InvalidValueError);
    expect(() => parseFechaContable('2026-10-16T00:00:00Z')).toThrow(InvalidValueError);
  });

  it('determina el día en hora de Colombia (UTC-5)', () => {
    // 2026-10-17 03:00 UTC = 2026-10-16 22:00 en Bogotá.
    expect(fechaContable(new Date('2026-10-17T03:00:00Z'))).toBe('2026-10-16');
    expect(fechaContable(new Date('2026-10-17T05:00:00Z'))).toBe('2026-10-17');
  });

  it('calcula el día anterior cruzando meses y años', () => {
    expect(diaAnterior('2026-10-16')).toBe('2026-10-15');
    expect(diaAnterior('2026-03-01')).toBe('2026-02-28');
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29');
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31');
  });
});
