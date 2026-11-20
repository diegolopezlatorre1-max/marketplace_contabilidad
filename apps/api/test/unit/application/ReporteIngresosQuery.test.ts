import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RegistrarAjusteUseCase } from '../../../src/application/commands/RegistrarAjusteUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import {
  MAX_DIAS_REPORTE,
  ReporteIngresosQuery,
} from '../../../src/application/queries/ReporteIngresosQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { Money } from '../../../src/domain/shared';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const comoContador = { actor: contador, correlationId: 'c' };
const reloj = { now: () => new Date('2026-10-31T20:00:00Z') };

function entorno() {
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  const ventas = new RegistrarVentaConfirmadaUseCase(base.uow, reloj, () => `venta-${++n}`);
  const ajustes = new RegistrarAjusteUseCase(base.uow, reloj);
  return {
    reporte: new ReporteIngresosQuery(base.reporte),
    /** Una orden de un vendedor; `fecha` con zona horaria. */
    vender: async (numeroOrden: string, valorBruto: string, fecha: string, vendedorId = 'V-1') => {
      await ventas.execute(
        {
          eventId: `evt-${numeroOrden}`,
          tipo: 'orden.confirmada',
          numeroOrden,
          fecha,
          estado: 'CONFIRMADA',
          lineas: [{ vendedorId, valorBruto }],
        },
        { actor: sistema, correlationId: 'c' },
      );
      return `venta-${n}`;
    },
    devolver: (ventaId: string, valor: string, fecha: string) =>
      ajustes.execute(
        { ventaId, tipo: 'DEVOLUCION', motivo: 'Devolución', valor, fecha },
        comoContador,
      ),
  };
}

const rango = (desde: string, hasta: string, vendedorId?: string) => ({
  desde,
  hasta,
  ...(vendedorId ? { vendedorId } : {}),
});

describe('ReporteIngresosQuery (HU-CON-05)', () => {
  it('suma ventas, comisiones y netos del rango, por día', async () => {
    const e = entorno();
    await e.vender('ORD-1', '100000', '2026-10-05T10:00:00-05:00');
    await e.vender('ORD-2', '50000', '2026-10-05T15:00:00-05:00', 'V-2');
    await e.vender('ORD-3', '30000', '2026-10-07T10:00:00-05:00');
    const r = await e.reporte.execute(rango('2026-10-01', '2026-10-15'), comoContador);
    expect(r.ventas).toEqual({
      cantidad: 3,
      valorBruto: '180000.00',
      comision: '18000.00',
      valorNeto: '162000.00',
    });
    expect(r.ajustes.cantidad).toBe(0);
    expect(r.totales).toEqual({
      valorBruto: '180000.00',
      comision: '18000.00',
      valorNeto: '162000.00',
    });
    expect(r.control.cuadra).toBe(true);
    expect(r.porDia.map((d) => [d.fecha, d.ventas.cantidad, d.totales.valorBruto])).toEqual([
      ['2026-10-05', 2, '150000.00'],
      ['2026-10-07', 1, '30000.00'],
    ]);
    const deV2 = await e.reporte.execute(rango('2026-10-01', '2026-10-15', 'V-2'), comoContador);
    expect(deV2.ventas.valorBruto).toBe('50000.00');
  });

  it('ubica los ajustes por la fecha del ajuste, no por la de la venta', async () => {
    const e = entorno();
    const venta = await e.vender('ORD-1', '100000', '2026-10-05T10:00:00-05:00');
    await e.devolver(venta, '30000', '2026-10-20');

    const q1 = await e.reporte.execute(rango('2026-10-01', '2026-10-15'), comoContador);
    expect(q1.ajustes.cantidad).toBe(0);
    expect(q1.totales.valorBruto).toBe('100000.00');

    const q2 = await e.reporte.execute(rango('2026-10-16', '2026-10-31'), comoContador);
    expect(q2.ventas.cantidad).toBe(0);
    expect(q2.ajustes).toEqual({
      cantidad: 1,
      valorBruto: '30000.00',
      comision: '3000.00',
      valorNeto: '27000.00',
    });
    expect(q2.totales).toEqual({
      valorBruto: '-30000.00',
      comision: '-3000.00',
      valorNeto: '-27000.00',
    });
    expect(q2.porDia[0]?.fecha).toBe('2026-10-20');

    const mes = await e.reporte.execute(rango('2026-10-01', '2026-10-31'), comoContador);
    expect(mes.totales).toEqual({
      valorBruto: '70000.00',
      comision: '7000.00',
      valorNeto: '63000.00',
    });
    expect(mes.control.cuadra).toBe(true);
  });

  it('una venta a las 23:30 hora Colombia queda en ese día (no en el siguiente de UTC)', async () => {
    const e = entorno();
    await e.vender('ORD-1', '100000', '2026-10-10T23:30:00-05:00');
    const dia = await e.reporte.execute(rango('2026-10-10', '2026-10-10'), comoContador);
    expect(dia.ventas.cantidad).toBe(1);
    expect(dia.porDia[0]?.fecha).toBe('2026-10-10');
    const siguiente = await e.reporte.execute(rango('2026-10-11', '2026-10-11'), comoContador);
    expect(siguiente.ventas.cantidad).toBe(0);
  });

  it('un rango sin movimientos devuelve ceros sin error', async () => {
    const r = await entorno().reporte.execute(rango('2026-01-01', '2026-01-31'), comoContador);
    expect(r.ventas).toEqual({
      cantidad: 0,
      valorBruto: '0.00',
      comision: '0.00',
      valorNeto: '0.00',
    });
    expect(r.totales).toEqual({ valorBruto: '0.00', comision: '0.00', valorNeto: '0.00' });
    expect(r.porDia).toEqual([]);
    expect(r.control.cuadra).toBe(true);
  });

  it('valida el rango (orden, fechas reales, máximo) y el rol', async () => {
    const { reporte } = entorno();
    await expect(reporte.execute(rango('2026-10-10', '2026-10-01'), comoContador)).rejects.toThrow(
      'posterior',
    );
    await expect(reporte.execute(rango('2026-02-30', '2026-03-01'), comoContador)).rejects.toThrow(
      'Fecha inválida',
    );
    // 2024 es bisiesto: 2024-01-01..2024-12-31 son 366 días (permitido); uno más no.
    expect(MAX_DIAS_REPORTE).toBe(366);
    await expect(
      reporte.execute(rango('2024-01-01', '2024-12-31'), comoContador),
    ).resolves.toBeTruthy();
    await expect(reporte.execute(rango('2024-01-01', '2025-01-01'), comoContador)).rejects.toThrow(
      '366',
    );
    await expect(
      reporte.execute(rango('2026-10-01', '2026-10-31'), { actor: sistema, correlationId: 'c' }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });

  it('propiedad: los totales coinciden con las transacciones registradas y con la suma por día', async () => {
    const arbVenta = fc.record({
      dia: fc.integer({ min: 1, max: 31 }),
      hora: fc.integer({ min: 0, max: 23 }),
      centavos: fc.integer({ min: 1, max: 10_000_000 }),
      devolucion: fc.option(
        fc.record({
          fraccion: fc.double({ min: 0.01, max: 1, noNaN: true }),
          diaExtra: fc.integer({ min: 0, max: 10 }),
        }),
        { nil: undefined },
      ),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(arbVenta, { maxLength: 12 }), async (lineas) => {
        const e = entorno();
        let esperadoBruto = Money.CERO;
        for (const [i, l] of lineas.entries()) {
          const dd = String(l.dia).padStart(2, '0');
          const hh = String(l.hora).padStart(2, '0');
          const bruto = (l.centavos / 100).toFixed(2);
          const venta = await e.vender(`ORD-${i}`, bruto, `2026-10-${dd}T${hh}:30:00-05:00`);
          esperadoBruto = esperadoBruto.add(Money.of(bruto));
          const diaAjuste = l.dia + (l.devolucion?.diaExtra ?? 0);
          if (l.devolucion && diaAjuste <= 31) {
            const valor = Math.max(0.01, Number(bruto) * l.devolucion.fraccion).toFixed(2);
            if (Money.of(valor).greaterThan(Money.of(bruto))) continue;
            await e.devolver(venta, valor, `2026-10-${String(diaAjuste).padStart(2, '0')}`);
            esperadoBruto = esperadoBruto.subtract(Money.of(valor));
          }
        }
        const r = await e.reporte.execute(rango('2026-10-01', '2026-10-31'), comoContador);
        expect(r.control.cuadra).toBe(true);
        expect(r.totales.valorBruto).toBe(esperadoBruto.toString());
        const sumaDias = r.porDia.reduce(
          (s, d) => s.add(Money.of(d.totales.valorBruto)),
          Money.CERO,
        );
        expect(sumaDias.toString()).toBe(r.totales.valorBruto);
        expect(r.ventas.cantidad).toBe(lineas.length);
      }),
      { numRuns: 60 },
    );
  });
});
