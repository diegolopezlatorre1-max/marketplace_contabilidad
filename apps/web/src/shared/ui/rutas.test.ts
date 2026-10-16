import { describe, expect, it } from 'vitest';
import { basePathDesde, rutaDelModulo } from './rutas';

describe('rutaDelModulo', () => {
  it('arma rutas absolutas desde la base del módulo', () => {
    expect(rutaDelModulo('/contabilidad', 'ventas')).toBe('/contabilidad/ventas');
    expect(rutaDelModulo('/contabilidad/', 'configuracion/comision')).toBe(
      '/contabilidad/configuracion/comision',
    );
    expect(rutaDelModulo('/contabilidad', '/ventas')).toBe('/contabilidad/ventas');
  });

  it('"." lleva al inicio del módulo', () => {
    expect(rutaDelModulo('/contabilidad', '.')).toBe('/contabilidad');
    expect(rutaDelModulo('', '.')).toBe('/');
  });
});

describe('basePathDesde', () => {
  it('quita la parte capturada por el splat', () => {
    expect(basePathDesde('/contabilidad/ventas', 'ventas')).toBe('/contabilidad');
    expect(
      basePathDesde('/admin/contabilidad/configuracion/comision', 'configuracion/comision'),
    ).toBe('/admin/contabilidad');
  });

  it('en el inicio del módulo devuelve la ruta sin barra final', () => {
    expect(basePathDesde('/contabilidad', '')).toBe('/contabilidad');
    expect(basePathDesde('/contabilidad/', '')).toBe('/contabilidad');
  });
});
