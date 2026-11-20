import { describe, expect, it } from 'vitest';
import {
  AplicadoExcedeSaldoError,
  Conciliacion,
  PoliticaConciliacion,
  type OrdenPorConciliar,
} from '../../../src/domain/conciliacion/Conciliacion';
import { PagoRecibido } from '../../../src/domain/conciliacion/PagoRecibido';
import { InvalidValueError, Money } from '../../../src/domain/shared';

const FECHA = new Date('2026-10-16T15:00:00Z');

function pago(valor: string, referencia = 'PSE-1') {
  return PagoRecibido.registrar({
    id: `p-${referencia}`,
    referenciaPasarela: referencia,
    fecha: FECHA,
    valor: Money.of(valor),
    origen: 'API',
  });
}

function orden(numeroOrden: string, valor: string, yaAplicado = '0'): OrdenPorConciliar {
  return { numeroOrden, valorOrden: Money.of(valor), valorYaAplicado: Money.of(yaAplicado) };
}

function conciliar(
  valorPago: string,
  ordenes: Array<{ orden: OrdenPorConciliar; valorAplicado?: Money }>,
  politica = new PoliticaConciliacion(),
) {
  return Conciliacion.conciliar({
    id: 'c-1',
    pago: pago(valorPago),
    ordenes,
    politica,
    usuario: 'u-contador',
    fecha: FECHA,
  });
}

describe('PagoRecibido', () => {
  it('registra el pago con su día contable y órdenes sin repetir', () => {
    const p = PagoRecibido.registrar({
      id: 'p-1',
      referenciaPasarela: ' PSE-889 ',
      fecha: new Date('2026-10-16T03:00:00Z'),
      valor: Money.of('150000.00'),
      origen: 'CSV',
      ordenesInformadas: ['ORD-1', 'ORD-1', ' ', 'ORD-2'],
    });
    expect(p.toJSON()).toMatchObject({
      referenciaPasarela: 'PSE-889',
      fechaContable: '2026-10-15',
      valor: '150000.00',
      origen: 'CSV',
      ordenesInformadas: ['ORD-1', 'ORD-2'],
    });
  });

  it('valida referencia, valor y fecha', () => {
    const base = { id: 'p', fecha: FECHA, valor: Money.of('1'), origen: 'API' as const };
    expect(() => PagoRecibido.registrar({ ...base, referenciaPasarela: ' ' })).toThrow(
      InvalidValueError,
    );
    expect(() =>
      PagoRecibido.registrar({ ...base, referenciaPasarela: 'R', valor: Money.of('0') }),
    ).toThrow(InvalidValueError);
    expect(() =>
      PagoRecibido.registrar({ ...base, referenciaPasarela: 'R', fecha: new Date('x') }),
    ).toThrow(InvalidValueError);
  });
});

describe('Conciliacion', () => {
  it('pago de 150.000 contra órdenes de 100.000 + 50.000 -> CONCILIADA', () => {
    const c = conciliar('150000', [
      { orden: orden('ORD-1', '100000') },
      { orden: orden('ORD-2', '50000') },
    ]);
    expect(c.estado).toBe('CONCILIADA');
    expect(c.diferencia.toString()).toBe('0.00');
    expect(c.valorAplicado.toString()).toBe('150000.00');
  });

  it('pago de 95.000 contra una orden de 100.000 -> diferencia -5.000, PENDIENTE', () => {
    const c = conciliar('95000', [{ orden: orden('ORD-1', '100000') }]);
    expect(c.estado).toBe('PENDIENTE');
    expect(c.diferencia.toString()).toBe('-5000.00');
  });

  it('un pago mayor a las órdenes también queda PENDIENTE', () => {
    const c = conciliar('120000', [{ orden: orden('ORD-1', '100000') }]);
    expect(c.diferencia.toString()).toBe('20000.00');
    expect(c.estado).toBe('PENDIENTE');
  });

  it('sin valor indicado aplica el saldo pendiente de la orden (pago en partes)', () => {
    const c = conciliar('60000', [{ orden: orden('ORD-1', '100000', '40000') }]);
    expect(c.detalles[0]?.valorAplicado.toString()).toBe('60000.00');
    expect(c.estado).toBe('CONCILIADA');
  });

  it('permite indicar el valor aplicado por orden', () => {
    const c = conciliar('30000', [
      { orden: orden('ORD-1', '100000'), valorAplicado: Money.of('30000') },
    ]);
    expect(c.estado).toBe('CONCILIADA');
    expect(c.toJSON().detalles).toEqual([
      { numeroOrden: 'ORD-1', valorOrden: '100000.00', valorAplicado: '30000.00' },
    ]);
  });

  it('rechaza aplicar más del saldo de la orden', () => {
    expect(() =>
      conciliar('100000', [
        { orden: orden('ORD-1', '100000', '50000'), valorAplicado: Money.of('60000') },
      ]),
    ).toThrow(AplicadoExcedeSaldoError);
    expect(() => conciliar('100000', [{ orden: orden('ORD-1', '100000', '100000') }])).toThrow(
      AplicadoExcedeSaldoError,
    );
  });

  it('rechaza órdenes repetidas, valores no positivos o ninguna orden', () => {
    expect(() =>
      conciliar('1', [{ orden: orden('ORD-1', '10') }, { orden: orden('ORD-1', '10') }]),
    ).toThrow(InvalidValueError);
    expect(() =>
      conciliar('1', [{ orden: orden('ORD-1', '10'), valorAplicado: Money.of('0') }]),
    ).toThrow(InvalidValueError);
    expect(() => conciliar('1', [])).toThrow(InvalidValueError);
  });

  it('aplica la tolerancia configurada', () => {
    const tolerancia = new PoliticaConciliacion(Money.of('100'));
    expect(conciliar('99900', [{ orden: orden('ORD-1', '100000') }], tolerancia).estado).toBe(
      'CONCILIADA',
    );
    expect(conciliar('99899.99', [{ orden: orden('ORD-1', '100000') }], tolerancia).estado).toBe(
      'PENDIENTE',
    );
    expect(() => new PoliticaConciliacion(Money.of('-1'))).toThrow(InvalidValueError);
  });
});
