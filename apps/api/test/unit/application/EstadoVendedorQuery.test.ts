import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RegistrarAjusteUseCase } from '../../../src/application/commands/RegistrarAjusteUseCase';
import { RegistrarPagoVendedorUseCase } from '../../../src/application/commands/RegistrarPagoVendedorUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { EstadoVendedorQuery } from '../../../src/application/queries/EstadoVendedorQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { MockSellersGateway } from '../../../src/infrastructure/integration/sellers/MockSellersGateway';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const admin: Actor = { id: 'u-admin', nombre: 'Admin', roles: ['ADMIN_FINANCIERO'] };
const reloj = { now: () => new Date('2026-11-25T15:00:00Z') };

/**
 * Comisión del 10 %. V-1 vende en octubre (100.000 el 5 y 50.000 el 20) y en noviembre
 * (200.000 el 3); V-2 vende 80.000 el 6 de octubre.
 */
async function entorno() {
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  const id = () => `id-${++n}`;
  const registrarVenta = new RegistrarVentaConfirmadaUseCase(base.uow, reloj, id);
  const ventas: Array<[string, string, string, string]> = [
    ['ORD-1', 'V-1', '2026-10-05T09:00:00-05:00', '100000.00'],
    ['ORD-2', 'V-1', '2026-10-20T09:00:00-05:00', '50000.00'],
    ['ORD-3', 'V-1', '2026-11-03T09:00:00-05:00', '200000.00'],
    ['ORD-4', 'V-2', '2026-10-06T09:00:00-05:00', '80000.00'],
  ];
  for (const [orden, vendedorId, fecha, valor] of ventas) {
    await registrarVenta.execute(
      {
        eventId: `evt-${orden}`,
        tipo: 'orden.confirmada',
        numeroOrden: orden,
        fecha,
        estado: 'CONFIRMADA',
        lineas: [{ vendedorId, valorBruto: valor }],
      },
      { actor: sistema },
    );
  }
  const ventaId = (orden: string) =>
    base.db.datos.ventas.find(({ venta }) => venta.numeroOrden === orden)!.venta.id;
  return {
    ...base,
    ventaId,
    estado: new EstadoVendedorQuery(
      base.estado,
      base.repos.pagosVendedor,
      new MockSellersGateway(),
    ),
    pagar: (valor: string, referencia: string) =>
      new RegistrarPagoVendedorUseCase(base.uow, reloj, id).execute(
        { vendedorId: 'V-1', valor, referencia },
        { actor: contador },
      ),
    ajustar: (orden: string, valor: string) =>
      new RegistrarAjusteUseCase(base.uow, reloj, id).execute(
        { ventaId: ventaId(orden), tipo: 'DEVOLUCION', motivo: 'Devolución', valor },
        { actor: contador },
      ),
  };
}

describe('EstadoVendedorQuery (HU-CON-07)', () => {
  it('muestra total vendido, comisión, pagado y pendiente del vendedor', async () => {
    const e = await entorno();
    await e.pagar('90000.00', 'TRF-1');
    const r = await e.estado.execute({ vendedorId: 'V-1' }, { actor: contador });

    expect(r).toMatchObject({
      vendedorId: 'V-1',
      vendedorNombre: 'Artesanías del Valle S.A.S.',
      desde: null,
      hasta: null,
      totales: {
        ventas: 3,
        vendido: '350000.00',
        comision: '35000.00',
        pagado: '90000.00',
        pendiente: '225000.00',
      },
      control: { cuadra: true, generado: '315000.00', liquidado: '315000.00' },
    });
    expect(r.periodos.map((p) => [p.periodo, p.vendido, p.pagado, p.pendiente, p.estado])).toEqual([
      ['2026-10-Q1', '100000.00', '90000.00', '0.00', 'PAGADO'],
      ['2026-10-Q2', '50000.00', '0.00', '45000.00', 'PENDIENTE'],
      ['2026-11-Q1', '200000.00', '0.00', '180000.00', 'PENDIENTE'],
    ]);
  });

  it('F01: con movimientos en dos meses, filtrar un mes muestra solo ese mes', async () => {
    const e = await entorno();
    const octubre = await e.estado.execute(
      { vendedorId: 'V-1', desde: '2026-10-Q1', hasta: '2026-10-Q2' },
      { actor: admin },
    );
    expect(octubre.periodos.map((p) => p.periodo)).toEqual(['2026-10-Q1', '2026-10-Q2']);
    expect(octubre.totales).toMatchObject({
      ventas: 2,
      vendido: '150000.00',
      pendiente: '135000.00',
    });

    const noviembre = await e.estado.execute(
      { vendedorId: 'V-1', desde: '2026-11-Q1', hasta: '2026-11-Q2' },
      { actor: admin },
    );
    expect(noviembre.totales).toMatchObject({ ventas: 1, vendido: '200000.00' });
    expect(noviembre.control.cuadra).toBe(true);
  });

  it('la regla de control cuadra con ajustes, pagos parciales y saldo a favor', async () => {
    const e = await entorno();
    await e.ajustar('ORD-2', '20000.00'); // Sobre una cuenta pendiente: baja el saldo.
    await e.pagar('90000.00', 'TRF-1'); // 2026-10-Q1 queda pagada.
    await e.ajustar('ORD-1', '30000.00'); // Sobre la cuenta pagada: 27.000 a favor.

    const r = await e.estado.execute({ vendedorId: 'V-1' }, { actor: contador });
    expect(r.totales.ajustes).toEqual({
      valor: '50000.00',
      comisionRevertida: '5000.00',
      netoRevertido: '45000.00',
      descontadoDelSaldo: '18000.00',
      saldoAFavor: '27000.00',
    });
    expect(r.saldoAFavorDisponible).toBe('27000.00');
    expect(r.control.cuadra).toBe(true);

    // El siguiente pago descuenta el saldo a favor y la regla sigue cuadrando.
    await e.pagar('10000.00', 'TRF-2');
    const despues = await e.estado.execute({ vendedorId: 'V-1' }, { actor: contador });
    expect(despues.saldoAFavorDisponible).toBe('0.00');
    expect(despues.totales.pagado).toBe('127000.00');
    expect(despues.periodos.find((p) => p.periodo === '2026-10-Q2')?.estado).toBe('PAGADO');
    expect(despues.control.cuadra).toBe(true);
  });

  it('propiedad: la regla de control cuadra tras cualquier secuencia de pagos y devoluciones', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.record({
              tipo: fc.constant('pago' as const),
              centavos: fc.integer({ min: 1, max: 30_000_000 }),
            }),
            fc.record({
              tipo: fc.constant('ajuste' as const),
              orden: fc.constantFrom('ORD-1', 'ORD-2', 'ORD-3'),
              centavos: fc.integer({ min: 1, max: 10_000_000 }),
            }),
          ),
          { maxLength: 8 },
        ),
        async (operaciones) => {
          const e = await entorno();
          let i = 0;
          for (const op of operaciones) {
            const valor = (op.centavos / 100).toFixed(2);
            // Las operaciones que violan una regla (pagar de más, ajustar de más) se rechazan.
            await (
              op.tipo === 'pago' ? e.pagar(valor, `R-${++i}`) : e.ajustar(op.orden, valor)
            ).catch(() => undefined);
          }
          const r = await e.estado.execute({ vendedorId: 'V-1' }, { actor: contador });
          expect(r.control.cuadra).toBe(true);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('un vendedor sin movimientos devuelve ceros y la regla cuadra', async () => {
    const e = await entorno();
    const r = await e.estado.execute({ vendedorId: 'V-9' }, { actor: contador });
    expect(r).toMatchObject({
      vendedorNombre: 'V-9',
      totales: { ventas: 0, vendido: '0.00', pagado: '0.00', pendiente: '0.00' },
      control: { cuadra: true },
      periodos: [],
    });
  });

  it('valida las quincenas y el rango', async () => {
    const e = await entorno();
    await expect(
      e.estado.execute({ vendedorId: 'V-1', desde: '2026-10-Q3' }, { actor: contador }),
    ).rejects.toThrow(/Periodo inválido/);
    await expect(
      e.estado.execute(
        { vendedorId: 'V-1', desde: '2026-11-Q1', hasta: '2026-10-Q1' },
        { actor: contador },
      ),
    ).rejects.toThrow(/posterior/);
  });

  it('rol VENDEDOR preparado: solo consulta su propio estado', async () => {
    const e = await entorno();
    const vendedor: Actor = { id: 'u-v1', nombre: 'V-1', roles: ['VENDEDOR'], vendedorId: 'V-1' };
    await expect(
      e.estado.execute({ vendedorId: 'V-1' }, { actor: vendedor }),
    ).resolves.toMatchObject({
      vendedorId: 'V-1',
    });
    await expect(
      e.estado.execute({ vendedorId: 'V-2' }, { actor: vendedor }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
    await expect(
      e.estado.execute({ vendedorId: 'V-1' }, { actor: sistema }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });
});
