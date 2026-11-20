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

    a.registrarPago({ vendedorId: 'V-1', valor: '40000', referencia: 'A', fecha: '2026-10-20' });
    expect(cuenta()?.saldoPendiente).toBe('95000.00');
    expect(cuenta()?.estado).toBe('PARCIAL');

    a.registrarPago({ vendedorId: 'V-1', valor: '95000', referencia: 'B', fecha: '2026-10-20' });
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

  it('ajustes (HU-CON-06): parcial + cancelación cuadran y descuentan el saldo', () => {
    const a = nuevo('12.5');
    const v = a.registrarVenta(venta('ORD-1', '100.05')); // comisión 12.51, neto 87.54
    const parcial = a.registrarAjuste({
      ventaId: v.id,
      tipo: 'DEVOLUCION',
      motivo: 'Defectuoso',
      valor: '50.03',
      fecha: '2026-10-06',
    });
    expect(parcial).toMatchObject({ comisionRevertida: '6.25', netoRevertido: '43.78' });
    expect(() =>
      a.registrarAjuste({
        ventaId: v.id,
        tipo: 'DEVOLUCION',
        motivo: 'x',
        valor: '50.03',
        fecha: '2026-10-06',
      }),
    ).toThrow(ErrorDeNegocio);

    const cierre = a.registrarAjuste({
      ventaId: v.id,
      tipo: 'CANCELACION',
      motivo: 'Resto',
      fecha: '2026-10-07',
    });
    expect(cierre).toMatchObject({
      valor: '50.02',
      comisionRevertida: '6.26',
      netoRevertido: '43.76',
    });
    expect(a.listarAjustes(v.id).map((x) => x.id)).toEqual([cierre.id, parcial.id]);
    expect(a.buscarAjustes({ desde: '2026-10-07' })).toEqual([
      { ...cierre, ventaId: v.id, numeroOrden: 'ORD-1', vendedorId: v.vendedorId },
    ]);
    expect(a.buscarAjustes({ vendedorId: 'otro' })).toEqual([]);
    expect(a.listarCuentasPorPagar({ periodo: '2026-10-Q1' })[0]?.saldoPendiente).toBe('0.00');
    expect(() =>
      a.registrarAjuste({ ventaId: v.id, tipo: 'CANCELACION', motivo: 'x', fecha: '2026-10-07' }),
    ).toThrow('ajustada por completo');
  });

  it('ajustes: rechaza ventas inexistentes y fechas anteriores a la venta', () => {
    const a = nuevo();
    const v = a.registrarVenta(venta('ORD-1', '1000'));
    expect(() =>
      a.registrarAjuste({
        ventaId: 'no-existe',
        tipo: 'CANCELACION',
        motivo: 'x',
        fecha: '2026-10-06',
      }),
    ).toThrow(ErrorDeNegocio);
    expect(() =>
      a.registrarAjuste({ ventaId: v.id, tipo: 'CANCELACION', motivo: 'x', fecha: '2026-10-04' }),
    ).toThrow('anterior a la venta');
  });

  it('reporte (HU-CON-05): totales del rango con los ajustes por su propia fecha', () => {
    const a = nuevo();
    const v1 = a.registrarVenta(venta('ORD-1', '100000', '2026-10-05'));
    a.registrarVenta(venta('ORD-2', '50000', '2026-10-07', 'V-2'));
    a.registrarVenta(venta('ORD-3', '30000', '2026-10-20'));
    a.registrarAjuste({
      ventaId: v1.id,
      tipo: 'DEVOLUCION',
      motivo: 'Defectuoso',
      valor: '20000',
      fecha: '2026-10-18',
    });

    const q1 = a.obtenerReporte({ desde: '2026-10-01', hasta: '2026-10-15' });
    expect(q1.ventas).toMatchObject({ cantidad: 2, valorBruto: '150000.00' });
    expect(q1.ajustes.cantidad).toBe(0);

    const q2 = a.obtenerReporte({ desde: '2026-10-16', hasta: '2026-10-31' });
    expect(q2.totales).toEqual({
      valorBruto: '10000.00',
      comision: '1000.00',
      valorNeto: '9000.00',
    });
    expect(q2.porDia.map((d) => d.fecha)).toEqual(['2026-10-18', '2026-10-20']);
    expect(q2.control.cuadra).toBe(true);

    expect(
      a.obtenerReporte({ desde: '2026-10-01', hasta: '2026-10-31', vendedorId: 'V-2' }).totales
        .valorBruto,
    ).toBe('50000.00');
    expect(() => a.obtenerReporte({ desde: '2026-10-31', hasta: '2026-10-01' })).toThrow(
      ErrorDeNegocio,
    );
  });

  it('separa las quincenas: día 15 es Q1 y día 16 es Q2', () => {
    const a = nuevo();
    expect(a.registrarVenta(venta('ORD-1', '1000', '2026-10-15')).periodo).toBe('2026-10-Q1');
    expect(a.registrarVenta(venta('ORD-2', '1000', '2026-10-16')).periodo).toBe('2026-10-Q2');
  });

  it('rechaza un pago mayor al saldo, a un vendedor sin saldo o con la referencia repetida', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '1000'));
    const pagar = (vendedorId: string, valor: string, referencia = 'A') =>
      a.registrarPago({ vendedorId, valor, referencia, fecha: '2026-10-20' });
    expect(() => pagar('V-1', '901')).toThrow(ErrorDeNegocio);
    expect(() => pagar('V-9', '1')).toThrow(ErrorDeNegocio);
    pagar('V-1', '100');
    expect(() => pagar('V-1', '100')).toThrow(/referencia/);
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

describe('AlmacenContabilidad (HU-CON-10, pago al vendedor)', () => {
  it('docx: cuentas de 90.000 y 45.000, un pago de 90.000 deja la primera PAGADA y saldo 45.000', () => {
    const a = nuevo();
    a.registrarVenta(venta('ORD-1', '100000', '2026-10-05'));
    a.registrarVenta(venta('ORD-2', '50000', '2026-10-20'));
    const pago = a.registrarPago({
      vendedorId: 'V-1',
      valor: '90000',
      referencia: 'TRF-1',
      fecha: '2026-11-09',
    });
    expect(pago.aplicaciones).toEqual([
      {
        periodo: '2026-10-Q1',
        valorAplicado: '90000.00',
        saldoAnterior: '90000.00',
        saldoNuevo: '0.00',
        estado: 'PAGADO',
      },
    ]);
    expect(a.listarCuentasPorPagar({}).map((c) => [c.periodo, c.estado, c.saldoPendiente])).toEqual(
      [
        ['2026-10-Q1', 'PAGADO', '0.00'],
        ['2026-10-Q2', 'PENDIENTE', '45000.00'],
      ],
    );
    expect(a.listarPagos({ vendedorId: 'V-1' }).map((p) => p.referencia)).toEqual(['TRF-1']);
    expect(a.listarPagos({ desde: '2026-11-10' })).toEqual([]);
  });

  it('descuenta primero el saldo a favor que dejó un ajuste sobre una cuenta pagada', () => {
    const a = nuevo();
    const v1 = a.registrarVenta(venta('ORD-1', '100000', '2026-10-05'));
    a.registrarVenta(venta('ORD-2', '50000', '2026-10-20'));
    a.registrarPago({
      vendedorId: 'V-1',
      valor: '90000',
      referencia: 'TRF-1',
      fecha: '2026-10-21',
    });
    const ajuste = a.registrarAjuste({
      ventaId: v1.id,
      tipo: 'DEVOLUCION',
      motivo: 'Devolución tras el pago',
      valor: '20000',
      fecha: '2026-10-22',
    });
    expect(ajuste.saldoAFavor).toBe('18000.00');
    expect(() =>
      a.registrarPago({
        vendedorId: 'V-1',
        valor: '27000.01',
        referencia: 'TRF-2',
        fecha: '2026-10-23',
      }),
    ).toThrow(/27000\.00/);
    const pago = a.registrarPago({
      vendedorId: 'V-1',
      valor: '27000',
      referencia: 'TRF-2',
      fecha: '2026-10-23',
    });
    expect(pago.saldoAFavorAplicado).toBe('18000.00');
    expect(a.listarCuentasPorPagar({ periodo: '2026-10-Q2' })[0]?.estado).toBe('PAGADO');
  });
});

describe('AlmacenContabilidad (HU-CON-07, estado por vendedor)', () => {
  function conMovimientos() {
    const a = nuevo();
    const v1 = a.registrarVenta(venta('ORD-1', '100000', '2026-10-05'));
    a.registrarVenta(venta('ORD-2', '50000', '2026-10-20'));
    a.registrarVenta(venta('ORD-3', '200000', '2026-11-03'));
    a.registrarPago({
      vendedorId: 'V-1',
      valor: '90000',
      referencia: 'TRF-1',
      fecha: '2026-11-04',
    });
    a.registrarAjuste({
      ventaId: v1.id,
      tipo: 'DEVOLUCION',
      motivo: 'Devolución tras el pago',
      valor: '30000',
      fecha: '2026-11-05',
    });
    return a;
  }

  it('totaliza vendido, comisión, ajustes, pagado y pendiente, y la regla cuadra', () => {
    const e = conMovimientos().obtenerEstadoVendedor('V-1');
    expect(e.totales).toMatchObject({
      ventas: 3,
      vendido: '350000.00',
      comision: '35000.00',
      pagado: '90000.00',
      pendiente: '225000.00',
    });
    expect(e.totales.ajustes).toMatchObject({ netoRevertido: '27000.00', saldoAFavor: '27000.00' });
    expect(e.saldoAFavorDisponible).toBe('27000.00');
    expect(e.control).toMatchObject({
      cuadra: true,
      generado: '315000.00',
      liquidado: '315000.00',
    });
  });

  it('filtra por quincenas: un mes muestra solo ese mes', () => {
    const e = conMovimientos().obtenerEstadoVendedor('V-1', '2026-11-Q1', '2026-11-Q2');
    expect(e.periodos.map((p) => p.periodo)).toEqual(['2026-11-Q1']);
    expect(e.totales.vendido).toBe('200000.00');
    expect(() => conMovimientos().obtenerEstadoVendedor('V-1', '2026-11-Q1', '2026-10-Q1')).toThrow(
      ErrorDeNegocio,
    );
  });
});
