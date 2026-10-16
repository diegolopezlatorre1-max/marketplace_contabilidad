import { describe, expect, it } from 'vitest';
import {
  ProcesarAjusteOrdenUseCase,
  type OrdenAjusteEntrada,
} from '../../../src/application/commands/ProcesarAjusteOrdenUseCase';
import { RegistrarAjusteUseCase } from '../../../src/application/commands/RegistrarAjusteUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarAjustesQuery } from '../../../src/application/queries/ListarAjustesQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { Money } from '../../../src/domain/shared';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const comoContador = { actor: contador, correlationId: 'corr-aj' };
const comoSistema = { actor: sistema, correlationId: 'corr-evt' };
const reloj = { now: () => new Date('2026-10-16T15:00:00Z') };

/** Base con comisión global del 10 % y la orden ORD-1 (V-1: 100.000, V-2: 50.000) del 5 de octubre. */
async function entorno() {
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  await new RegistrarVentaConfirmadaUseCase(base.uow, reloj, () => `venta-${++n}`).execute(
    {
      eventId: 'evt-venta',
      tipo: 'orden.confirmada',
      numeroOrden: 'ORD-1',
      fecha: '2026-10-05T09:00:00-05:00',
      estado: 'CONFIRMADA',
      lineas: [
        { vendedorId: 'V-1', valorBruto: '100000.00' },
        { vendedorId: 'V-2', valorBruto: '50000.00' },
      ],
    },
    comoSistema,
  );
  let a = 0;
  const id = () => `ajuste-${++a}`;
  return {
    ...base,
    registrar: new RegistrarAjusteUseCase(base.uow, reloj, id),
    procesar: new ProcesarAjusteOrdenUseCase(base.uow, reloj, id),
    listar: new ListarAjustesQuery(base.repos.ajustes),
    saldo: (vendedorId: string) => {
      const c = base.db.datos.cuentas.find((x) => x.vendedorId === vendedorId)!;
      return c.totalNeto.subtract(c.pagado).toString();
    },
  };
}

function evento(over: Partial<OrdenAjusteEntrada> = {}): OrdenAjusteEntrada {
  return {
    eventId: 'evt-cancel',
    tipo: 'orden.cancelada',
    numeroOrden: 'ORD-1',
    fecha: '2026-10-08T10:00:00-05:00',
    motivo: 'Cancelada por el comprador',
    lineas: [{ vendedorId: 'V-1' }, { vendedorId: 'V-2' }],
    ...over,
  };
}

describe('RegistrarAjusteUseCase (HU-CON-06, ajuste manual)', () => {
  it('registra una devolución parcial: guarda motivo, fecha y valor y baja el saldo', async () => {
    const e = await entorno();
    expect(e.saldo('V-1')).toBe('90000.00');
    const ajuste = await e.registrar.execute(
      {
        ventaId: 'venta-1',
        tipo: 'DEVOLUCION',
        motivo: 'Producto defectuoso',
        valor: '30000',
        fecha: '2026-10-10',
      },
      comoContador,
    );
    expect(ajuste).toMatchObject({
      id: 'ajuste-1',
      numeroOrden: 'ORD-1',
      vendedorId: 'V-1',
      motivo: 'Producto defectuoso',
      fechaContable: '2026-10-10',
      valor: '30000.00',
      comisionRevertida: '3000.00',
      netoRevertido: '27000.00',
      saldoAFavor: '0.00',
      origen: 'MANUAL',
      registradoPor: 'u-contador',
    });
    expect(e.saldo('V-1')).toBe('63000.00');
    expect(e.db.datos.auditoria.at(-1)).toMatchObject({
      entidad: 'ajuste_contable',
      accion: 'REGISTRAR',
      usuario: 'u-contador',
      correlationId: 'corr-aj',
    });
    expect(e.db.datos.outbox.at(-1)).toMatchObject({
      tipo: 'contabilidad.ajuste.registrado',
      payload: { ajusteId: 'ajuste-1', netoRevertido: '27000.00' },
    });
  });

  it('solo permite ajustes sobre ventas existentes (ORDEN_INEXISTENTE)', async () => {
    const e = await entorno();
    await expect(
      e.registrar.execute({ ventaId: 'no-existe', tipo: 'CANCELACION', motivo: 'x' }, comoContador),
    ).rejects.toMatchObject({ code: 'ORDEN_INEXISTENTE' });
    expect(e.db.datos.ajustes).toHaveLength(0);
  });

  it('un ajuste que excede lo ajustable no deja rastros (rollback)', async () => {
    const e = await entorno();
    await e.registrar.execute(
      { ventaId: 'venta-1', tipo: 'DEVOLUCION', motivo: 'Parcial', valor: '60000' },
      comoContador,
    );
    await expect(
      e.registrar.execute(
        { ventaId: 'venta-1', tipo: 'DEVOLUCION', motivo: 'Otra', valor: '40000.01' },
        comoContador,
      ),
    ).rejects.toMatchObject({ code: 'AJUSTE_EXCEDE_SALDO' });
    expect(e.db.datos.ajustes).toHaveLength(1);
    expect(e.saldo('V-1')).toBe('36000.00');
  });

  it('si la cuenta ya se pagó, el excedente queda como saldo a favor del marketplace', async () => {
    const e = await entorno();
    const cuenta = e.db.datos.cuentas.find((c) => c.vendedorId === 'V-1')!;
    cuenta.pagado = Money.of('80000');
    const ajuste = await e.registrar.execute(
      { ventaId: 'venta-1', tipo: 'CANCELACION', motivo: 'Cancelada tras el pago' },
      comoContador,
    );
    expect(ajuste.netoRevertido).toBe('90000.00');
    expect(ajuste.saldoAFavor).toBe('80000.00');
    expect(e.saldo('V-1')).toBe('0.00');
  });

  it('rechaza fechas anteriores a la venta y roles distintos de CONTADOR', async () => {
    const e = await entorno();
    await expect(
      e.registrar.execute(
        { ventaId: 'venta-1', tipo: 'CANCELACION', motivo: 'x', fecha: '2026-10-04' },
        comoContador,
      ),
    ).rejects.toThrow('anterior a la venta');
    await expect(
      e.registrar.execute({ ventaId: 'venta-1', tipo: 'CANCELACION', motivo: 'x' }, comoSistema),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });
});

describe('ProcesarAjusteOrdenUseCase (HU-CON-06, eventos de Órdenes)', () => {
  it('orden.cancelada multi-vendedor: un ajuste por línea; repetido -> YA_PROCESADO', async () => {
    const e = await entorno();
    const r = await e.procesar.execute(evento(), comoSistema);
    expect(r).toMatchObject({ resultado: 'PROCESADO', ajustes: ['ajuste-1', 'ajuste-2'] });
    expect(e.saldo('V-1')).toBe('0.00');
    expect(e.saldo('V-2')).toBe('0.00');
    expect(e.db.datos.ajustes.map(({ ajuste }) => ajuste.origen)).toEqual(['EVENTO', 'EVENTO']);

    expect((await e.procesar.execute(evento(), comoSistema)).resultado).toBe('YA_PROCESADO');
    expect(e.db.datos.ajustes).toHaveLength(2);
  });

  it('orden.devuelta parcial y luego orden.cancelada revierten todo, sin pasarse', async () => {
    const e = await entorno();
    await e.procesar.execute(
      evento({
        eventId: 'evt-dev',
        tipo: 'orden.devuelta',
        lineas: [{ vendedorId: 'V-1', valorDevuelto: '25000.00' }],
      }),
      comoSistema,
    );
    expect(e.saldo('V-1')).toBe('67500.00');
    await e.procesar.execute(evento({ lineas: [{ vendedorId: 'V-1' }] }), comoSistema);
    expect(e.saldo('V-1')).toBe('0.00');
    const previos = await e.repos.ajustes.previosDeVenta('venta-1');
    expect(previos.valor.toString()).toBe('100000.00');
    expect(previos.comision.toString()).toBe('10000.00');

    // Otra cancelación sobre lo ya ajustado no tiene efecto.
    const otra = await e.procesar.execute(
      evento({ eventId: 'evt-cancel-2', lineas: [{ vendedorId: 'V-1' }] }),
      comoSistema,
    );
    expect(otra.resultado).toBe('IGNORADO');
  });

  it('una orden nunca registrada responde IGNORADO y queda en evento_ignorado', async () => {
    const e = await entorno();
    const r = await e.procesar.execute(evento({ numeroOrden: 'ORD-NUNCA' }), comoSistema);
    expect(r.resultado).toBe('IGNORADO');
    expect(e.db.datos.ignorados[0]?.motivo).toContain('sin venta registrada');
    expect(e.db.datos.inbox).toContain('evt-cancel');
  });

  it('una devolución que excede lo ajustable revierte todo el evento', async () => {
    const e = await entorno();
    await expect(
      e.procesar.execute(
        evento({
          eventId: 'evt-dev',
          tipo: 'orden.devuelta',
          lineas: [
            { vendedorId: 'V-1', valorDevuelto: '10000.00' },
            { vendedorId: 'V-2', valorDevuelto: '50000.01' },
          ],
        }),
        comoSistema,
      ),
    ).rejects.toMatchObject({ code: 'AJUSTE_EXCEDE_SALDO' });
    expect(e.db.datos.ajustes).toHaveLength(0);
    expect(e.db.datos.inbox).not.toContain('evt-dev');
  });

  it('es exclusivo del rol SISTEMA', async () => {
    const e = await entorno();
    await expect(e.procesar.execute(evento(), comoContador)).rejects.toBeInstanceOf(
      NoAutorizadoError,
    );
  });
});

describe('ListarAjustesQuery', () => {
  it('filtra por venta y valida el rango de fechas', async () => {
    const e = await entorno();
    await e.procesar.execute(evento(), comoSistema);
    const deV1 = await e.listar.execute({ ventaId: 'venta-1', page: 1, size: 50 }, comoContador);
    expect(deV1.total).toBe(1);
    expect(deV1.items[0]).toMatchObject({ vendedorId: 'V-1', tipo: 'CANCELACION' });
    await expect(
      e.listar.execute(
        { desde: '2026-10-10', hasta: '2026-10-01', page: 1, size: 50 },
        comoContador,
      ),
    ).rejects.toThrow('posterior');
  });
});
