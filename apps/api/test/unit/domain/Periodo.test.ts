import { describe, expect, it } from 'vitest';
import { InvalidValueError, Periodo } from '../../../src/domain/shared';

describe('Periodo (quincenal)', () => {
  it('asigna la quincena según el día en hora de Colombia', () => {
    expect(Periodo.fromDate(new Date('2026-10-01T12:00:00-05:00')).codigo).toBe('2026-10-Q1');
    expect(Periodo.fromDate(new Date('2026-10-15T23:59:59-05:00')).codigo).toBe('2026-10-Q1');
    expect(Periodo.fromDate(new Date('2026-10-16T00:00:00-05:00')).codigo).toBe('2026-10-Q2');
    expect(Periodo.fromDate(new Date('2026-10-31T23:59:59-05:00')).codigo).toBe('2026-10-Q2');
  });

  it('usa la zona horaria contable y no la UTC para el corte', () => {
    // 16 oct 03:00 UTC = 15 oct 22:00 en Bogotá -> todavía Q1
    expect(Periodo.fromDate(new Date('2026-10-16T03:00:00Z')).codigo).toBe('2026-10-Q1');
    // 1 nov 02:00 UTC = 31 oct 21:00 en Bogotá -> octubre Q2
    expect(Periodo.fromDate(new Date('2026-11-01T02:00:00Z')).codigo).toBe('2026-10-Q2');
  });

  it('calcula fechas de inicio y fin, incluyendo febrero', () => {
    const q2feb = Periodo.parse('2028-02-Q2');
    expect(q2feb.fechaInicio).toBe('2028-02-16');
    expect(q2feb.fechaFin).toBe('2028-02-29');
    expect(Periodo.parse('2026-02-Q2').fechaFin).toBe('2026-02-28');
    expect(Periodo.parse('2026-10-Q1').fechaFin).toBe('2026-10-15');
  });

  it('avanza al siguiente periodo, cruzando el año', () => {
    expect(Periodo.parse('2026-10-Q1').siguiente().codigo).toBe('2026-10-Q2');
    expect(Periodo.parse('2026-10-Q2').siguiente().codigo).toBe('2026-11-Q1');
    expect(Periodo.parse('2026-12-Q2').siguiente().codigo).toBe('2027-01-Q1');
  });

  it('rechaza códigos inválidos', () => {
    expect(() => Periodo.parse('2026-13-Q1')).toThrow(InvalidValueError);
    expect(() => Periodo.parse('2026-10-Q3')).toThrow(InvalidValueError);
    expect(() => Periodo.parse('octubre')).toThrow(InvalidValueError);
    expect(() => Periodo.fromDate(new Date('x'))).toThrow(InvalidValueError);
  });
});
