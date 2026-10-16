import { describe, expect, it } from 'vitest';
import {
  ConfiguracionComision,
  seleccionarVigente,
  type ConfiguracionComisionProps,
} from '../../../src/domain/comision/ConfiguracionComision';
import { DomainError, InvalidValueError, Porcentaje } from '../../../src/domain/shared';

function config(over: Partial<ConfiguracionComisionProps> = {}): ConfiguracionComision {
  return ConfiguracionComision.reconstituir({
    id: 'c-1',
    porcentaje: Porcentaje.of('10'),
    alcance: 'GLOBAL',
    referenciaId: null,
    vigenteDesde: '2026-01-01',
    vigenteHasta: null,
    creadoPor: 'u-admin',
    ...over,
  });
}

describe('ConfiguracionComision', () => {
  it('crea una vigencia GLOBAL abierta', () => {
    const c = ConfiguracionComision.crear({
      id: 'c-1',
      porcentaje: Porcentaje.of('12.5'),
      alcance: 'GLOBAL',
      vigenteDesde: '2026-10-16',
      creadoPor: 'u-admin',
    });
    expect(c.abierta).toBe(true);
    expect(c.toJSON()).toEqual({
      id: 'c-1',
      porcentaje: '12.5000',
      alcance: 'GLOBAL',
      referenciaId: null,
      vigenteDesde: '2026-10-16',
      vigenteHasta: null,
      creadoPor: 'u-admin',
    });
  });

  it('valida la referencia según el alcance', () => {
    expect(() => config({ referenciaId: 'V-1' })).toThrow(InvalidValueError);
    expect(() => config({ alcance: 'VENDEDOR' })).toThrow(InvalidValueError);
    expect(() => config({ alcance: 'CATEGORIA', referenciaId: '' })).toThrow(InvalidValueError);
    expect(config({ alcance: 'VENDEDOR', referenciaId: 'V-1' }).referenciaId).toBe('V-1');
  });

  it('valida las fechas de vigencia', () => {
    expect(() => config({ vigenteDesde: '2026-02-30' })).toThrow(InvalidValueError);
    expect(() => config({ vigenteHasta: '2025-12-31' })).toThrow(InvalidValueError);
    expect(config({ vigenteHasta: '2026-01-01' }).cubre('2026-01-01')).toBe(true);
  });

  it('al cerrarla termina el día anterior al inicio de la nueva', () => {
    const cerrada = config().cerrarEn('2026-10-16');
    expect(cerrada.vigenteHasta).toBe('2026-10-15');
    expect(cerrada.abierta).toBe(false);
  });

  it('permite una nueva vigencia retroactiva si empieza después de la actual', () => {
    expect(config().cerrarEn('2026-01-02').vigenteHasta).toBe('2026-01-01');
  });

  it('rechaza una nueva vigencia que se solaparía con la actual', () => {
    expect(() => config().cerrarEn('2026-01-01')).toThrow(DomainError);
    expect(() => config().cerrarEn('2025-12-31')).toThrow(
      expect.objectContaining({ code: 'CONFLICTO' }),
    );
  });

  it('no cierra dos veces la misma vigencia', () => {
    expect(() => config().cerrarEn('2026-05-01').cerrarEn('2026-06-01')).toThrow(
      expect.objectContaining({ code: 'CONFLICTO' }),
    );
  });

  it('cubre la fecha desde el primer día hasta el último inclusive', () => {
    const c = config({ vigenteDesde: '2026-01-01', vigenteHasta: '2026-10-15' });
    expect(c.cubre('2025-12-31')).toBe(false);
    expect(c.cubre('2026-01-01')).toBe(true);
    expect(c.cubre('2026-10-15')).toBe(true);
    expect(c.cubre('2026-10-16')).toBe(false);
    expect(config().cubre('2099-12-31')).toBe(true);
  });
});

describe('seleccionarVigente', () => {
  const global10 = config({ id: 'g10', vigenteHasta: '2026-10-15' });
  const global12 = config({
    id: 'g12',
    porcentaje: Porcentaje.of('12'),
    vigenteDesde: '2026-10-16',
  });
  const vendedor = config({
    id: 'v',
    alcance: 'VENDEDOR',
    referenciaId: 'V-1',
    vigenteDesde: '2026-06-01',
  });
  const categoria = config({
    id: 'cat',
    alcance: 'CATEGORIA',
    referenciaId: 'CAT-1',
    vigenteDesde: '2026-06-01',
  });
  const todas = [global10, global12, vendedor, categoria];

  it('elige la vigencia GLOBAL según la fecha', () => {
    expect(seleccionarVigente([global10, global12], '2026-10-15', 'V-9')?.id).toBe('g10');
    expect(seleccionarVigente([global10, global12], '2026-10-16', 'V-9')?.id).toBe('g12');
  });

  it('aplica la prioridad vendedor > categoría > global', () => {
    expect(seleccionarVigente(todas, '2026-07-01', 'V-1', 'CAT-1')?.id).toBe('v');
    expect(seleccionarVigente(todas, '2026-07-01', 'V-2', 'CAT-1')?.id).toBe('cat');
    expect(seleccionarVigente(todas, '2026-07-01', 'V-2', 'CAT-2')?.id).toBe('g10');
    expect(seleccionarVigente(todas, '2026-07-01', 'V-2')?.id).toBe('g10');
  });

  it('ignora configuraciones específicas fuera de su vigencia', () => {
    expect(seleccionarVigente(todas, '2026-05-31', 'V-1', 'CAT-1')?.id).toBe('g10');
  });

  it('devuelve undefined si nada cubre la fecha', () => {
    expect(seleccionarVigente(todas, '2025-12-31', 'V-1')).toBeUndefined();
  });
});
