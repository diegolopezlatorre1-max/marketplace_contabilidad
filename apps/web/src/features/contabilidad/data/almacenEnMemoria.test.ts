import { describe, expect, it } from 'vitest';
import { AlmacenContabilidad, ErrorDeNegocio } from './almacenEnMemoria';

function nuevo(porcentaje = '10'): AlmacenContabilidad {
  const almacen = new AlmacenContabilidad();
  almacen.configurarPorcentaje({ desde: '2026-01-01', porcentaje });
  return almacen;
}

function venta(orden: string, bruto: string, fecha = '2026-10-05', vendedorId = 'V-1') {
  return {
    numeroOrden: orden,
    vendedorId,
    vendedorNombre: `Vendedor ${vendedorId}`,
    fecha,
    valorBruto: bruto,
  };
}

describe('AlmacenContabilidad (reglas de HU-09, 01, 02 y 03)', () => {
  it('escenario 1: venta de 100000 al 10 % -> comisión 10000 y neto 90000', () => {
    const f = nuevo().registrarVenta(venta('ORD-1', '100000'));
    expect(f.valorBruto).toBe('100000.00');
    expect(f.comision).toBe('10000.00');
    expect(f.valorNeto).toBe('90000.00');
    expect(f.porcentajeAplicado).toBe('10.0000');
  });

  it('escenario 2: un cambio de porcentaje no altera las ventas ya calculadas', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '100000', '2026-10-03'));
    a.configurarPorcentaje({ desde: '2026-10-10', porcentaje: '12' });
    a.registrarVenta(venta('ORD-2', '100000', '2026-10-12'));
    const filas = a.listarComisiones('2026-10-Q1');
    expect(filas.find((f) => f.numeroOrden === 'ORD-1')?.comision).toBe('10000.00');
    expect(filas.find((f) => f.numeroOrden === 'ORD-1')?.porcentajeAplicado).toBe('10.0000');
    expect(filas.find((f) => f.numeroOrden === 'ORD-2')?.comision).toBe('12000.00');
  });

  it('escenario 3: redondea HALF_UP y bruto = comisión + neto', () => {
    const f = nuevo('12.5').registrarVenta(venta('ORD-1', '100.05')); // 12.50625 -> 12.51
    expect(f.comision).toBe('12.51');
    expect(f.valorNeto).toBe('87.54');
  });

  it('rechaza una venta sin porcentaje vigente', () => {
    expect(() => new AlmacenContabilidad().registrarVenta(venta('ORD-1', '1000'))).toThrow(
      ErrorDeNegocio,
    );
  });

  it('rechaza una venta anterior a la primera vigencia', () => {
    expect(() => nuevo().registrarVenta(venta('ORD-1', '1000', '2025-12-31'))).toThrow(
      ErrorDeNegocio,
    );
  });

  it('rechaza registrar dos veces la misma orden del mismo vendedor', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '1000'));
    expect(() => a.registrarVenta(venta('ORD-1', '1000'))).toThrow(ErrorDeNegocio);
  });

  it('acepta una orden multi-vendedor (una línea por vendedor)', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '1000', '2026-10-05', 'V-1'));
    a.registrarVenta(venta('ORD-1', '2000', '2026-10-05', 'V-2'));
    expect(a.listarComisiones()).toHaveLength(2);
  });

  it('acumula por vendedor y quincena, y el estado depende del saldo', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '100000'));
    a.registrarVenta(venta('ORD-2', '50000'));
    const cuenta = () => a.listarCuentasPorPagar({ periodo: '2026-10-Q1' })[0];
    expect(cuenta()?.saldoPendiente).toBe('135000.00');
    expect(cuenta()?.estado).toBe('PENDIENTE');

    a.registrarPago({ vendedorId: 'V-1', periodo: '2026-10-Q1', valor: '40000' });
    expect(cuenta()?.saldoPendiente).toBe('95000.00');
    expect(cuenta()?.estado).toBe('PENDIENTE');

    a.registrarPago({ vendedorId: 'V-1', periodo: '2026-10-Q1', valor: '95000' });
    expect(cuenta()?.saldoPendiente).toBe('0.00');
    expect(cuenta()?.estado).toBe('PAGADO');
  });

  it('resume el saldo por vendedor y abre el detalle de cada venta', () => {
    const a = nuevo();
    const f1 = a.registrarVenta(venta('ORD-1', '100000'));
    a.registrarVenta(venta('ORD-2', '50000'));
    a.registrarVenta(venta('ORD-3', '20000', '2026-10-20'));
    a.registrarVenta(venta('ORD-4', '10000', '2026-10-05', 'V-2'));

    expect(a.resumirPorVendedor('2026-10-Q1')).toEqual([
      expect.objectContaining({ vendedorId: 'V-1', cuentas: 1, saldoPendiente: '135000.00' }),
      expect.objectContaining({ vendedorId: 'V-2', saldoPendiente: '9000.00' }),
    ]);
    expect(a.resumirPorVendedor()[0]).toMatchObject({ cuentas: 2, saldoPendiente: '153000.00' });

    expect(a.listarComisiones('2026-10-Q1', 'V-2').map((c) => c.numeroOrden)).toEqual(['ORD-4']);
    expect(a.obtenerVenta(f1.id)).toMatchObject({
      numeroOrden: 'ORD-1',
      comision: '10000.00',
      estadoOrigen: 'CONFIRMADA',
    });
    expect(() => a.obtenerVenta('no-existe')).toThrow(ErrorDeNegocio);
  });

  it('separa las quincenas: día 15 es Q1 y día 16 es Q2', () => {
    const a = nuevo();
    expect(a.registrarVenta(venta('ORD-1', '1000', '2026-10-15')).periodo).toBe('2026-10-Q1');
    expect(a.registrarVenta(venta('ORD-2', '1000', '2026-10-16')).periodo).toBe('2026-10-Q2');
  });

  it('rechaza un pago mayor al saldo o a una cuenta inexistente', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '1000'));
    expect(() =>
      a.registrarPago({ vendedorId: 'V-1', periodo: '2026-10-Q1', valor: '901' }),
    ).toThrow(ErrorDeNegocio);
    expect(() => a.registrarPago({ vendedorId: 'V-9', periodo: '2026-10-Q1', valor: '1' })).toThrow(
      ErrorDeNegocio,
    );
  });

  it('rechaza montos en cero, con 3 decimales o con formato inválido', () => {
    const a = nuevo();
    expect(() => a.registrarVenta(venta('ORD-1', '0'))).toThrow(ErrorDeNegocio);
    expect(() => a.registrarVenta(venta('ORD-2', '10.005'))).toThrow(ErrorDeNegocio);
    expect(() => a.registrarVenta(venta('ORD-3', '1e5'))).toThrow(ErrorDeNegocio);
  });

  it('rechaza porcentajes fuera de rango o vigencias repetidas', () => {
    const a = nuevo();
    expect(() => a.configurarPorcentaje({ desde: '2026-02-01', porcentaje: '100.5' })).toThrow(
      ErrorDeNegocio,
    );
    expect(() => a.configurarPorcentaje({ desde: '2026-01-01', porcentaje: '11' })).toThrow(
      ErrorDeNegocio,
    );
  });
});
