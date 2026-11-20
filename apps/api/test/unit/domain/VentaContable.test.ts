import { describe, expect, it } from 'vitest';
import { InvalidValueError, Money } from '../../../src/domain/shared';
import {
  OrdenNoConfirmadaError,
  VentaContable,
  type RegistrarVentaDatos,
} from '../../../src/domain/venta/VentaContable';

function datos(over: Partial<RegistrarVentaDatos> = {}): RegistrarVentaDatos {
  return {
    id: 'v-1',
    numeroOrden: 'ORD-1001',
    vendedorId: 'V-1',
    categoriaId: 'CAT-9',
    fecha: new Date('2026-10-05T09:58:00-05:00'),
    valorBruto: Money.of('100000.00'),
    estadoOrigen: 'CONFIRMADA',
    ...over,
  };
}

describe('VentaContable', () => {
  it('registra una orden confirmada con su día y quincena contables', () => {
    expect(VentaContable.registrar(datos()).toJSON()).toEqual({
      id: 'v-1',
      numeroOrden: 'ORD-1001',
      vendedorId: 'V-1',
      categoriaId: 'CAT-9',
      fecha: '2026-10-05T14:58:00.000Z',
      fechaContable: '2026-10-05',
      periodo: '2026-10-Q1',
      valorBruto: '100000.00',
      estadoOrigen: 'CONFIRMADA',
    });
  });

  it('solo acepta órdenes CONFIRMADA', () => {
    for (const estado of ['PENDIENTE', 'confirmada', 'CANCELADA']) {
      expect(() => VentaContable.registrar(datos({ estadoOrigen: estado }))).toThrow(
        OrdenNoConfirmadaError,
      );
    }
  });

  it('usa la hora de Colombia para el día y la quincena', () => {
    // 16 de octubre 03:00 UTC = 15 de octubre 22:00 en Bogotá -> Q1.
    const v = VentaContable.registrar(datos({ fecha: new Date('2026-10-16T03:00:00Z') }));
    expect(v.fechaContable).toBe('2026-10-15');
    expect(v.periodo.codigo).toBe('2026-10-Q1');
  });

  it('exige valor bruto positivo, orden y vendedor', () => {
    expect(() => VentaContable.registrar(datos({ valorBruto: Money.of('0') }))).toThrow(
      InvalidValueError,
    );
    expect(() => VentaContable.registrar(datos({ numeroOrden: ' ' }))).toThrow(InvalidValueError);
    expect(() => VentaContable.registrar(datos({ vendedorId: '' }))).toThrow(InvalidValueError);
  });

  it('sin categoría queda en null', () => {
    expect(VentaContable.registrar(datos({ categoriaId: undefined })).categoriaId).toBeNull();
  });
});
