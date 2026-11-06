import { describe, expect, it } from 'vitest';
import { diferencias } from './diferencias';

describe('diferencias (HU-CON-11)', () => {
  it('compara propiedad por propiedad, incluidas las anidadas y las listas', () => {
    const r = diferencias(
      { cuentaPorPagar: { saldoPendiente: '90000.00' }, estado: 'PENDIENTE' },
      {
        cuentaPorPagar: { saldoPendiente: '63000.00' },
        estado: 'PENDIENTE',
        ajuste: { id: 'a-1' },
      },
    );
    expect(r).toEqual([
      {
        campo: 'cuentaPorPagar.saldoPendiente',
        antes: '90000.00',
        despues: '63000.00',
        cambio: true,
      },
      { campo: 'estado', antes: 'PENDIENTE', despues: 'PENDIENTE', cambio: false },
      { campo: 'ajuste.id', antes: null, despues: 'a-1', cambio: true },
    ]);
    expect(diferencias(null, { a: [1, { b: true }] })).toEqual([
      { campo: 'a[0]', antes: null, despues: '1', cambio: true },
      { campo: 'a[1].b', antes: null, despues: 'true', cambio: true },
    ]);
  });

  it('un registro sin valores no produce filas', () => {
    expect(diferencias(null, null)).toEqual([]);
  });
});
