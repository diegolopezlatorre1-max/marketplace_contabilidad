import { describe, expect, it } from 'vitest';
import { ConciliarPagoUseCase } from '../../../src/application/commands/ConciliarPagoUseCase';
import { ImportarPagosRecibidosUseCase } from '../../../src/application/commands/ImportarPagosRecibidosUseCase';
import {
  RegistrarPagoRecibidoUseCase,
  type PagoRecibidoEntrada,
} from '../../../src/application/commands/RegistrarPagoRecibidoUseCase';
import {
  ListarConciliacionesQuery,
  ListarPagosRecibidosQuery,
  ObtenerConciliacionQuery,
} from '../../../src/application/queries/ConciliacionQueries';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { Money } from '../../../src/domain/shared';
import { VentaContable } from '../../../src/domain/venta/VentaContable';
import { crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Pagos', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const reloj = { now: () => new Date('2026-10-16T15:00:00Z') };

function crearEntorno() {
  const base = crearBaseEnMemoria();
  let n = 0;
  const id = () => `id-${++n}`;
  const venta = (numeroOrden: string, vendedorId: string, valor: string) =>
    base.db.datos.ventas.push({
      venta: VentaContable.registrar({
        id: id(),
        numeroOrden,
        vendedorId,
        fecha: new Date('2026-10-05T15:00:00Z'),
        valorBruto: Money.of(valor),
        estadoOrigen: 'CONFIRMADA',
      }),
      eventId: `evt-${numeroOrden}`,
    });
  return {
    ...base,
    venta,
    registrar: new RegistrarPagoRecibidoUseCase(base.uow, reloj, undefined, id),
    conciliar: new ConciliarPagoUseCase(base.uow, reloj, undefined, id),
    importar: new ImportarPagosRecibidosUseCase(base.uow, reloj, undefined, id),
    pagos: new ListarPagosRecibidosQuery(base.repos.pagosRecibidos),
    conciliaciones: new ListarConciliacionesQuery(base.repos.conciliaciones),
    detalle: new ObtenerConciliacionQuery(base.repos.conciliaciones),
  };
}

function evento(over: Partial<PagoRecibidoEntrada> = {}): PagoRecibidoEntrada {
  return {
    eventId: 'evt-p1',
    tipo: 'pago.recibido',
    referenciaPasarela: 'PSE-889',
    fecha: '2026-10-16T10:00:00-05:00',
    valor: '150000.00',
    origen: 'API',
    ...over,
  };
}

describe('RegistrarPagoRecibidoUseCase', () => {
  it('con órdenes concilia automáticamente: 150.000 vs 100.000 + 50.000 -> CONCILIADO', async () => {
    const e = crearEntorno();
    e.venta('ORD-1', 'V-1', '100000');
    e.venta('ORD-2', 'V-2', '30000');
    e.venta('ORD-2', 'V-3', '20000');
    const r = await e.registrar.execute(evento({ ordenes: ['ORD-1', 'ORD-2'] }), {
      actor: sistema,
    });
    expect(r).toMatchObject({ resultado: 'PROCESADO', estado: 'CONCILIADO' });
    const [c] = e.db.datos.conciliaciones;
    expect(c?.diferencia.toString()).toBe('0.00');
    expect(c?.detalles.map((d) => [d.numeroOrden, d.valorOrden.toString()])).toEqual([
      ['ORD-1', '100000.00'],
      ['ORD-2', '50000.00'],
    ]);
    expect(e.db.datos.outbox.map((x) => x.tipo)).toEqual(['contabilidad.conciliacion.cerrada']);
    expect(e.db.datos.auditoria.map((x) => [x.entidad, x.accion, x.usuario])).toEqual([
      ['pago_recibido', 'REGISTRAR', 'sistema-marketplace'],
      ['conciliacion', 'CONCILIAR', 'sistema-marketplace'],
    ]);
  });

  it('sin órdenes deja el pago SIN_CONCILIAR', async () => {
    const e = crearEntorno();
    const r = await e.registrar.execute(evento(), { actor: sistema });
    expect(r.estado).toBe('SIN_CONCILIAR');
    expect(e.db.datos.conciliaciones).toHaveLength(0);
  });

  it('si las órdenes informadas no existen, registra el pago sin conciliar y explica por qué', async () => {
    const e = crearEntorno();
    const r = await e.registrar.execute(evento({ ordenes: ['ORD-X'] }), { actor: sistema });
    expect(r).toMatchObject({ resultado: 'PROCESADO', estado: 'SIN_CONCILIAR' });
    expect(r.detalle).toContain('ORD-X');
    expect(e.db.datos.pagos).toHaveLength(1);
  });

  it('un evento repetido responde YA_PROCESADO; la misma referencia con otro eventId -> 409', async () => {
    const e = crearEntorno();
    await e.registrar.execute(evento(), { actor: sistema });
    expect(await e.registrar.execute(evento(), { actor: sistema })).toEqual({
      eventId: 'evt-p1',
      resultado: 'YA_PROCESADO',
    });
    await expect(
      e.registrar.execute(evento({ eventId: 'evt-otro' }), { actor: sistema }),
    ).rejects.toMatchObject({ code: 'REFERENCIA_DUPLICADA' });
    expect(e.db.datos.pagos).toHaveLength(1);
  });

  it('solo el rol SISTEMA registra pagos', async () => {
    const e = crearEntorno();
    await expect(e.registrar.execute(evento(), { actor: contador })).rejects.toThrow(
      NoAutorizadoError,
    );
  });
});

describe('ConciliarPagoUseCase', () => {
  async function pagoSinConciliar(
    e: ReturnType<typeof crearEntorno>,
    valor: string,
    ref = 'PSE-1',
  ) {
    const r = await e.registrar.execute(
      evento({ eventId: `evt-${ref}`, referenciaPasarela: ref, valor }),
      { actor: sistema },
    );
    return r.pagoId!;
  }

  it('pago de 95.000 contra una orden de 100.000 -> diferencia -5.000, PENDIENTE', async () => {
    const e = crearEntorno();
    e.venta('ORD-1', 'V-1', '100000');
    const pagoId = await pagoSinConciliar(e, '95000');
    const c = await e.conciliar.execute(
      { pagoId, ordenes: [{ numeroOrden: 'ORD-1' }] },
      { actor: contador, correlationId: 'corr-1' },
    );
    expect(c).toMatchObject({ estado: 'PENDIENTE', diferencia: '-5000.00', usuario: 'u-contador' });
    expect(e.db.datos.outbox).toHaveLength(0);
    expect(e.db.datos.auditoria.at(-1)).toMatchObject({
      entidad: 'conciliacion',
      accion: 'CONCILIAR',
      correlationId: 'corr-1',
    });
  });

  it('una orden pagada en dos pagos parciales cuadra y no admite más', async () => {
    const e = crearEntorno();
    e.venta('ORD-1', 'V-1', '100000');
    const p1 = await pagoSinConciliar(e, '40000', 'PSE-1');
    const p2 = await pagoSinConciliar(e, '60000', 'PSE-2');
    const p3 = await pagoSinConciliar(e, '1000', 'PSE-3');
    const c1 = await e.conciliar.execute(
      { pagoId: p1, ordenes: [{ numeroOrden: 'ORD-1', valorAplicado: '40000' }] },
      { actor: contador },
    );
    const c2 = await e.conciliar.execute(
      { pagoId: p2, ordenes: [{ numeroOrden: 'ORD-1' }] },
      { actor: contador },
    );
    expect([c1.estado, c2.estado]).toEqual(['CONCILIADA', 'CONCILIADA']);
    expect(c2.detalles[0]?.valorAplicado).toBe('60000.00');
    await expect(
      e.conciliar.execute({ pagoId: p3, ordenes: [{ numeroOrden: 'ORD-1' }] }, { actor: contador }),
    ).rejects.toMatchObject({ code: 'APLICADO_EXCEDE_SALDO' });
  });

  it('rechaza orden inexistente, pago inexistente y conciliar dos veces', async () => {
    const e = crearEntorno();
    e.venta('ORD-1', 'V-1', '100000');
    const pagoId = await pagoSinConciliar(e, '100000');
    await expect(
      e.conciliar.execute({ pagoId, ordenes: [{ numeroOrden: 'ORD-X' }] }, { actor: contador }),
    ).rejects.toMatchObject({ code: 'ORDEN_INEXISTENTE' });
    await expect(
      e.conciliar.execute(
        { pagoId: 'nope', ordenes: [{ numeroOrden: 'ORD-1' }] },
        { actor: contador },
      ),
    ).rejects.toMatchObject({ code: 'PAGO_INEXISTENTE' });
    await e.conciliar.execute({ pagoId, ordenes: [{ numeroOrden: 'ORD-1' }] }, { actor: contador });
    await expect(
      e.conciliar.execute({ pagoId, ordenes: [{ numeroOrden: 'ORD-1' }] }, { actor: contador }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_DUPLICADA' });
  });

  it('solo el CONTADOR concilia', async () => {
    const e = crearEntorno();
    await expect(
      e.conciliar.execute({ pagoId: 'x', ordenes: [{ numeroOrden: 'ORD-1' }] }, { actor: sistema }),
    ).rejects.toThrow(NoAutorizadoError);
  });
});

describe('ImportarPagosRecibidosUseCase', () => {
  it('registra cada fila por separado: importado, duplicado y error', async () => {
    const e = crearEntorno();
    e.venta('ORD-1', 'V-1', '100000');
    const fecha = new Date('2026-10-16T15:00:00Z');
    const r = await e.importar.execute(
      {
        filas: [
          { linea: 2, referencia: 'CSV-1', fecha, valor: '100000.00', ordenes: ['ORD-1'] },
          { linea: 3, referencia: 'CSV-1', fecha, valor: '5.00', ordenes: [] },
          { linea: 4, referencia: 'CSV-3', fecha, valor: '0', ordenes: [] },
          { linea: 5, error: 'Valor inválido' },
          { linea: 6, referencia: 'CSV-6', fecha, valor: '10.00', ordenes: [] },
        ],
      },
      { actor: contador },
    );
    expect(r.filas.map((f) => [f.linea, f.resultado, f.estado])).toEqual([
      [2, 'IMPORTADO', 'CONCILIADO'],
      [3, 'DUPLICADO', undefined],
      [4, 'ERROR', undefined],
      [5, 'ERROR', undefined],
      [6, 'IMPORTADO', 'SIN_CONCILIAR'],
    ]);
    expect(r).toMatchObject({ importados: 2, duplicados: 1, errores: 2 });
    expect(e.db.datos.pagos.map(({ pago }) => pago.origen)).toEqual(['CSV', 'CSV']);
  });
});

describe('Consultas de conciliación', () => {
  it('lista pagos por estado y conciliaciones con su detalle', async () => {
    const e = crearEntorno();
    e.venta('ORD-1', 'V-1', '100000');
    await e.registrar.execute(evento({ valor: '100000', ordenes: ['ORD-1'] }), { actor: sistema });
    await e.registrar.execute(evento({ eventId: 'evt-2', referenciaPasarela: 'PSE-2' }), {
      actor: sistema,
    });
    const leer = { actor: contador };
    expect(
      (await e.pagos.execute({ estado: 'SIN_CONCILIAR' }, leer)).map((p) => p.referenciaPasarela),
    ).toEqual(['PSE-2']);
    const [c] = await e.conciliaciones.execute({ estado: 'CONCILIADA' }, leer);
    expect(c).toMatchObject({ referenciaPasarela: 'PSE-889', diferencia: '0.00' });
    expect(await e.detalle.execute({ id: c!.id }, leer)).toMatchObject({ id: c!.id });
    expect(await e.detalle.execute({ id: 'nope' }, leer)).toBeNull();
    await expect(
      e.pagos.execute({ desde: '2026-10-20', hasta: '2026-10-01' }, leer),
    ).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
    await expect(e.pagos.execute({}, { actor: sistema })).rejects.toThrow(NoAutorizadoError);
  });
});
