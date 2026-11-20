import { describe, expect, it } from 'vitest';
import { RegistrarAjusteUseCase } from '../../../src/application/commands/RegistrarAjusteUseCase';
import {
  EVENTO_PAGO_VENDEDOR_REGISTRADO,
  RegistrarPagoVendedorUseCase,
  type RegistrarPagoVendedorEntrada,
} from '../../../src/application/commands/RegistrarPagoVendedorUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarPagosVendedorQuery } from '../../../src/application/queries/ListarPagosVendedorQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const admin: Actor = { id: 'u-admin', nombre: 'Admin', roles: ['ADMIN_FINANCIERO'] };
const comoContador = { actor: contador, correlationId: 'corr-pago' };
const reloj = { now: () => new Date('2026-11-10T15:00:00Z') };

/**
 * Comisión del 10 %. V-1 vende 100.000 el 5 de octubre (neto 90.000, 2026-10-Q1) y 50.000 el
 * 20 de octubre (neto 45.000, 2026-10-Q2): debe 135.000, como en el ejemplo del docx.
 */
async function entorno() {
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  const registrarVenta = new RegistrarVentaConfirmadaUseCase(base.uow, reloj, () => `venta-${++n}`);
  for (const [orden, fecha, valor] of [
    ['ORD-1', '2026-10-05T09:00:00-05:00', '100000.00'],
    ['ORD-2', '2026-10-20T09:00:00-05:00', '50000.00'],
  ] as const) {
    await registrarVenta.execute(
      {
        eventId: `evt-${orden}`,
        tipo: 'orden.confirmada',
        numeroOrden: orden,
        fecha,
        estado: 'CONFIRMADA',
        lineas: [{ vendedorId: 'V-1', valorBruto: valor }],
      },
      { actor: sistema },
    );
  }
  let p = 0;
  const registrar = new RegistrarPagoVendedorUseCase(base.uow, reloj, () => `pago-${++p}`);
  return {
    ...base,
    registrar,
    pagar: (over: Partial<RegistrarPagoVendedorEntrada> = {}) =>
      registrar.execute(
        { vendedorId: 'V-1', valor: '90000.00', referencia: 'TRF-1', ...over },
        comoContador,
      ),
    ajustar: new RegistrarAjusteUseCase(base.uow, reloj, () => `ajuste-${++p}`),
    listar: new ListarPagosVendedorQuery(base.repos.pagosVendedor),
    cuentas: () =>
      base.db.datos.cuentas
        .filter((c) => c.vendedorId === 'V-1')
        .sort((a, b) => a.periodo.localeCompare(b.periodo))
        .map((c) => [c.periodo, c.pagado.toString(), c.totalNeto.subtract(c.pagado).toString()]),
  };
}

describe('RegistrarPagoVendedorUseCase (HU-CON-10)', () => {
  it('docx: un pago de 90.000 deja la cuenta más antigua PAGADA y el saldo en 45.000', async () => {
    const e = await entorno();
    const pago = await e.pagar({ soporte: 'Comprobante 0001', fecha: '2026-11-09' });

    expect(pago).toMatchObject({
      id: 'pago-1',
      vendedorId: 'V-1',
      fechaContable: '2026-11-09',
      valor: '90000.00',
      saldoAFavorAplicado: '0.00',
      referencia: 'TRF-1',
      soporte: 'Comprobante 0001',
      registradoPor: 'u-contador',
      aplicaciones: [
        {
          periodo: '2026-10-Q1',
          valorAplicado: '90000.00',
          saldoAnterior: '90000.00',
          saldoNuevo: '0.00',
          estado: 'PAGADO',
        },
      ],
    });
    expect(e.cuentas()).toEqual([
      ['2026-10-Q1', '90000.00', '0.00'],
      ['2026-10-Q2', '0.00', '45000.00'],
    ]);
    const listado = await e.repos.cuentasPorPagar.listar({ vendedorId: 'V-1' });
    expect(listado.map((c) => [c.periodo, c.estado])).toEqual([
      ['2026-10-Q2', 'PENDIENTE'],
      ['2026-10-Q1', 'PAGADO'],
    ]);
  });

  it('un pago parcial deja la cuenta PARCIAL', async () => {
    const e = await entorno();
    await e.pagar({ valor: '100000.00' });
    const listado = await e.repos.cuentasPorPagar.listar({ vendedorId: 'V-1' });
    expect(listado.map((c) => [c.periodo, c.estado, c.saldoPendiente])).toEqual([
      ['2026-10-Q2', 'PARCIAL', '35000.00'],
      ['2026-10-Q1', 'PAGADO', '0.00'],
    ]);
  });

  it('rechaza un pago mayor al saldo y no deja rastros', async () => {
    const e = await entorno();
    await expect(e.pagar({ valor: '135000.01' })).rejects.toMatchObject({
      code: 'PAGO_EXCEDE_SALDO',
    });
    expect(e.cuentas()).toEqual([
      ['2026-10-Q1', '0.00', '90000.00'],
      ['2026-10-Q2', '0.00', '45000.00'],
    ]);
    expect(e.db.datos.pagosVendedor).toHaveLength(0);
    expect(e.db.datos.auditoria.filter((a) => a.entidad === 'pago_vendedor')).toHaveLength(0);
  });

  it('rechaza repetir la referencia para el mismo vendedor', async () => {
    const e = await entorno();
    await e.pagar({ valor: '10000.00' });
    await expect(e.pagar({ valor: '10000.00' })).rejects.toMatchObject({
      code: 'REFERENCIA_DUPLICADA',
    });
    expect(e.db.datos.pagosVendedor).toHaveLength(1);
  });

  it('descuenta el saldo a favor que dejó un ajuste sobre una cuenta ya pagada', async () => {
    const e = await entorno();
    await e.pagar(); // Q1 pagada (90.000).
    // Se cancela ORD-1 después del pago: los 90.000 netos quedan a favor del marketplace.
    const ajuste = await e.ajustar.execute(
      { ventaId: 'venta-1', tipo: 'CANCELACION', motivo: 'Cancelada tras el pago' },
      comoContador,
    );
    expect(ajuste.saldoAFavor).toBe('90000.00');

    // Q2 debe 45.000 y hay 90.000 a favor: no hay nada que transferir.
    await expect(e.pagar({ referencia: 'TRF-2', valor: '0.01' })).rejects.toMatchObject({
      code: 'PAGO_EXCEDE_SALDO',
    });

    // Llega una venta nueva en noviembre (neto 90.000): debe 135.000 − 90.000 a favor = 45.000.
    await new RegistrarVentaConfirmadaUseCase(e.uow, reloj, () => 'venta-3').execute(
      {
        eventId: 'evt-ORD-3',
        tipo: 'orden.confirmada',
        numeroOrden: 'ORD-3',
        fecha: '2026-11-03T09:00:00-05:00',
        estado: 'CONFIRMADA',
        lineas: [{ vendedorId: 'V-1', valorBruto: '100000.00' }],
      },
      { actor: sistema },
    );
    const pago = await e.pagar({ referencia: 'TRF-3', valor: '45000.00' });
    expect(pago.saldoAFavorAplicado).toBe('90000.00');
    expect(pago.aplicaciones.map((a) => [a.periodo, a.valorAplicado, a.estado])).toEqual([
      ['2026-10-Q2', '45000.00', 'PAGADO'],
      ['2026-11-Q1', '90000.00', 'PAGADO'],
    ]);
    expect((await e.repos.pagosVendedor.saldoAFavorDisponible('V-1')).toString()).toBe('0.00');
  });

  it('registra auditoría con el antes y el después, y publica el evento', async () => {
    const e = await entorno();
    await e.pagar();
    const auditoria = e.db.datos.auditoria.filter((a) => a.entidad === 'pago_vendedor');
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({
      entidadId: 'pago-1',
      accion: 'REGISTRAR',
      usuario: 'u-contador',
      correlationId: 'corr-pago',
      valoresAnteriores: {
        saldoAFavor: '0.00',
        cuentas: [
          {
            periodo: '2026-10-Q1',
            valorPagado: '0.00',
            saldoPendiente: '90000.00',
            estado: 'PENDIENTE',
          },
        ],
      },
    });
    const evento = e.db.datos.outbox.find((x) => x.tipo === EVENTO_PAGO_VENDEDOR_REGISTRADO);
    expect(evento?.payload).toMatchObject({
      pagoId: 'pago-1',
      vendedorId: 'V-1',
      valor: '90000.00',
      referencia: 'TRF-1',
    });
  });

  it('solo el contador registra pagos', async () => {
    const e = await entorno();
    await expect(
      e.registrar.execute({ vendedorId: 'V-1', valor: '1.00', referencia: 'X' }, { actor: admin }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });

  it('rechaza una fecha futura', async () => {
    const e = await entorno();
    await expect(e.pagar({ fecha: '2026-11-11' })).rejects.toThrow(/fecha futura/);
  });
});

describe('ListarPagosVendedorQuery (HU-CON-10)', () => {
  it('filtra por vendedor y fecha del pago, del más reciente al más antiguo', async () => {
    const e = await entorno();
    await e.pagar({ valor: '10000.00', referencia: 'A', fecha: '2026-11-02' });
    await e.pagar({ valor: '20000.00', referencia: 'B', fecha: '2026-11-09' });

    const todos = await e.listar.execute({ page: 1, size: 50 }, { actor: admin });
    expect(todos.items.map((p) => p.referencia)).toEqual(['B', 'A']);
    expect(todos.total).toBe(2);

    const rango = await e.listar.execute(
      { vendedorId: 'V-1', desde: '2026-11-05', hasta: '2026-11-10', page: 1, size: 50 },
      { actor: contador },
    );
    expect(rango.items.map((p) => p.referencia)).toEqual(['B']);
    expect(
      (await e.listar.execute({ vendedorId: 'V-2', page: 1, size: 50 }, { actor: contador })).total,
    ).toBe(0);
  });

  it('valida el rango y el rol', async () => {
    const e = await entorno();
    await expect(
      e.listar.execute(
        { desde: '2026-11-10', hasta: '2026-11-01', page: 1, size: 50 },
        { actor: contador },
      ),
    ).rejects.toThrow(/posterior/);
    await expect(
      e.listar.execute({ page: 1, size: 50 }, { actor: sistema }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });
});
