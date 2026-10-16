import { describe, expect, it } from 'vitest';
import {
  RegistrarVentaConfirmadaUseCase,
  type OrdenConfirmadaEntrada,
} from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarVentasQuery } from '../../../src/application/queries/ListarVentasQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const reloj = { now: () => new Date('2026-10-05T15:00:00Z') };

function orden(over: Partial<OrdenConfirmadaEntrada> = {}): OrdenConfirmadaEntrada {
  return {
    eventId: 'evt-001',
    tipo: 'orden.confirmada',
    numeroOrden: 'ORD-1001',
    fecha: '2026-10-05T09:58:00-05:00',
    estado: 'CONFIRMADA',
    lineas: [{ vendedorId: 'V-1', valorBruto: '100000.00', categoriaId: 'CAT-9' }],
    ...over,
  };
}

function crearEntorno({ conComision = true } = {}) {
  const { db, repos, uow } = crearBaseEnMemoria();
  if (conComision) db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  const registrar = new RegistrarVentaConfirmadaUseCase(uow, reloj, () => `venta-${++n}`);
  const listar = new ListarVentasQuery(repos.ventas);
  return { db, registrar, listar };
}

describe('RegistrarVentaConfirmadaUseCase', () => {
  it('registra la venta, su comisión y la cuenta por pagar', async () => {
    const { db, registrar } = crearEntorno();
    const r = await registrar.execute(orden(), { actor: sistema, correlationId: 'corr-1' });

    expect(r).toEqual({ eventId: 'evt-001', resultado: 'PROCESADO', ventas: ['venta-1'] });
    expect(db.datos.ventas.map(({ venta }) => venta.toJSON())).toEqual([
      expect.objectContaining({
        id: 'venta-1',
        numeroOrden: 'ORD-1001',
        vendedorId: 'V-1',
        fechaContable: '2026-10-05',
        periodo: '2026-10-Q1',
        valorBruto: '100000.00',
      }),
    ]);
    expect(db.datos.comisiones[0]?.comision.toJSON()).toMatchObject({
      porcentajeAplicado: '10.0000',
      comision: '10000.00',
      valorNeto: '90000.00',
    });
    expect(db.datos.cuentas).toEqual([
      expect.objectContaining({ vendedorId: 'V-1', periodo: '2026-10-Q1' }),
    ]);
    expect(db.datos.cuentas[0]?.totalNeto.toString()).toBe('90000.00');
    expect(db.datos.inbox).toEqual(['evt-001']);
  });

  it('deja auditoría y publica contabilidad.venta.registrada', async () => {
    const { db, registrar } = crearEntorno();
    await registrar.execute(orden(), { actor: sistema, correlationId: 'corr-1' });

    expect(db.datos.auditoria).toEqual([
      expect.objectContaining({
        entidad: 'venta_contable',
        entidadId: 'venta-1',
        accion: 'REGISTRAR',
        usuario: 'sistema-marketplace',
        correlationId: 'corr-1',
      }),
    ]);
    expect(db.datos.outbox).toEqual([
      {
        tipo: 'contabilidad.venta.registrada',
        payload: expect.objectContaining({
          ventaId: 'venta-1',
          numeroOrden: 'ORD-1001',
          comision: '10000.00',
          valorNeto: '90000.00',
          periodo: '2026-10-Q1',
        }),
      },
    ]);
  });

  it('un evento repetido responde YA_PROCESADO sin duplicar', async () => {
    const { db, registrar } = crearEntorno();
    await registrar.execute(orden(), { actor: sistema });
    const r = await registrar.execute(orden(), { actor: sistema });
    expect(r).toEqual({ eventId: 'evt-001', resultado: 'YA_PROCESADO' });
    expect(db.datos.ventas).toHaveLength(1);
    expect(db.datos.cuentas[0]?.totalNeto.toString()).toBe('90000.00');
  });

  it('una orden no confirmada se ignora y queda registrada como ignorada', async () => {
    const { db, registrar } = crearEntorno();
    const r = await registrar.execute(orden({ estado: 'PENDIENTE' }), { actor: sistema });
    expect(r.resultado).toBe('IGNORADO');
    expect(r.detalle).toContain('PENDIENTE');
    expect(db.datos.ventas).toHaveLength(0);
    expect(db.datos.ignorados).toEqual([{ eventId: 'evt-001', motivo: r.detalle }]);
    expect(await registrar.execute(orden({ estado: 'PENDIENTE' }), { actor: sistema })).toEqual({
      eventId: 'evt-001',
      resultado: 'YA_PROCESADO',
    });
  });

  it('una orden multi-vendedor genera una venta y una cuenta por vendedor', async () => {
    const { db, registrar } = crearEntorno();
    const r = await registrar.execute(
      orden({
        lineas: [
          { vendedorId: 'V-2', valorBruto: '50000.00' },
          { vendedorId: 'V-1', valorBruto: '100000.00' },
        ],
      }),
      { actor: sistema },
    );
    expect(r.ventas).toHaveLength(2);
    expect(db.datos.ventas.map(({ venta }) => venta.vendedorId)).toEqual(['V-1', 'V-2']);
    expect(db.datos.cuentas.map((c) => [c.vendedorId, c.totalNeto.toString()]).sort()).toEqual([
      ['V-1', '90000.00'],
      ['V-2', '45000.00'],
    ]);
  });

  it('acumula los netos del mismo vendedor y quincena (90.000 + 45.000 = 135.000)', async () => {
    const { db, registrar } = crearEntorno();
    await registrar.execute(orden(), { actor: sistema });
    await registrar.execute(
      orden({
        eventId: 'evt-002',
        numeroOrden: 'ORD-1002',
        fecha: '2026-10-10T12:00:00-05:00',
        lineas: [{ vendedorId: 'V-1', valorBruto: '50000.00' }],
      }),
      { actor: sistema },
    );
    expect(db.datos.cuentas).toHaveLength(1);
    expect(db.datos.cuentas[0]?.totalNeto.toString()).toBe('135000.00');
  });

  it('separa las cuentas por quincena', async () => {
    const { db, registrar } = crearEntorno();
    await registrar.execute(orden(), { actor: sistema });
    await registrar.execute(
      orden({ eventId: 'evt-002', numeroOrden: 'ORD-1002', fecha: '2026-10-16T08:00:00-05:00' }),
      { actor: sistema },
    );
    expect(db.datos.cuentas.map((c) => c.periodo).sort()).toEqual(['2026-10-Q1', '2026-10-Q2']);
  });

  it('la misma orden con otro eventId responde ORDEN_DUPLICADA sin cambios', async () => {
    const { db, registrar } = crearEntorno();
    await registrar.execute(orden(), { actor: sistema });
    await expect(
      registrar.execute(orden({ eventId: 'evt-otro' }), { actor: sistema }),
    ).rejects.toMatchObject({ code: 'ORDEN_DUPLICADA' });
    expect(db.datos.ventas).toHaveLength(1);
    expect(db.datos.inbox).toEqual(['evt-001']);
  });

  it('sin porcentaje vigente no registra nada (COMISION_NO_CONFIGURADA)', async () => {
    const { db, registrar } = crearEntorno({ conComision: false });
    await expect(registrar.execute(orden(), { actor: sistema })).rejects.toMatchObject({
      code: 'COMISION_NO_CONFIGURADA',
    });
    expect(db.datos.ventas).toHaveLength(0);
    expect(db.datos.cuentas).toHaveLength(0);
    expect(db.datos.inbox).toHaveLength(0);
  });

  it('usa el porcentaje vigente en la fecha de la venta', async () => {
    const { db, registrar } = crearEntorno();
    const [inicial] = db.datos.configuraciones;
    db.datos.configuraciones = [
      inicial!.cerrarEn('2026-10-05'),
      comisionGlobal('12', '2026-10-05'),
    ];
    await registrar.execute(orden(), { actor: sistema });
    expect(db.datos.comisiones[0]?.comision.toJSON()).toMatchObject({
      porcentajeAplicado: '12.0000',
      comision: '12000.00',
      valorNeto: '88000.00',
    });
  });

  it('solo el rol SISTEMA puede registrar', async () => {
    const { registrar } = crearEntorno();
    await expect(registrar.execute(orden(), { actor: contador })).rejects.toThrow(
      NoAutorizadoError,
    );
  });
});

describe('ListarVentasQuery', () => {
  it('lista las ventas con su comisión y filtra por vendedor', async () => {
    const { registrar, listar } = crearEntorno();
    await registrar.execute(
      orden({
        lineas: [
          { vendedorId: 'V-1', valorBruto: '100000.00' },
          { vendedorId: 'V-2', valorBruto: '50000.00' },
        ],
      }),
      { actor: sistema },
    );
    const pagina = await listar.execute(
      { vendedorId: 'V-2', page: 1, size: 50 },
      { actor: contador },
    );
    expect(pagina.total).toBe(1);
    expect(pagina.items[0]).toMatchObject({ vendedorId: 'V-2', comision: '5000.00' });
  });

  it('valida el rango de fechas y el rol', async () => {
    const { listar } = crearEntorno();
    await expect(
      listar.execute(
        { desde: '2026-10-10', hasta: '2026-10-01', page: 1, size: 50 },
        { actor: contador },
      ),
    ).rejects.toMatchObject({ code: 'VALOR_INVALIDO' });
    await expect(listar.execute({ page: 1, size: 50 }, { actor: sistema })).rejects.toThrow(
      NoAutorizadoError,
    );
  });
});
