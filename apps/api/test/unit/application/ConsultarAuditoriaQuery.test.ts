import { describe, expect, it } from 'vitest';
import { RegistrarPagoVendedorUseCase } from '../../../src/application/commands/RegistrarPagoVendedorUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ConsultarAuditoriaQuery } from '../../../src/application/queries/ConsultarAuditoriaQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema-marketplace', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const admin: Actor = { id: 'u-admin', nombre: 'Admin', roles: ['ADMIN_FINANCIERO'] };
const reloj = { now: () => new Date('2026-11-10T15:00:00Z') };
const pagina = { page: 1, size: 50 };

/** Una venta (auditada por el sistema) y un pago al vendedor (auditado por el contador). */
async function entorno() {
  const base = crearBaseEnMemoria();
  base.db.datos.configuraciones.push(comisionGlobal('10'));
  await new RegistrarVentaConfirmadaUseCase(base.uow, reloj, () => 'venta-1').execute(
    {
      eventId: 'evt-1',
      tipo: 'orden.confirmada',
      numeroOrden: 'ORD-1',
      fecha: '2026-10-05T09:00:00-05:00',
      estado: 'CONFIRMADA',
      lineas: [{ vendedorId: 'V-1', valorBruto: '100000.00' }],
    },
    { actor: sistema },
  );
  await new RegistrarPagoVendedorUseCase(base.uow, reloj, () => 'pago-1').execute(
    { vendedorId: 'V-1', valor: '40000.00', referencia: 'TRF-1' },
    { actor: contador, correlationId: 'corr-1' },
  );
  // Fechas conocidas para probar el filtro por día (hora de Colombia).
  base.db.datos.auditoriaFechas[0] = new Date('2026-10-05T14:00:00Z');
  base.db.datos.auditoriaFechas[1] = new Date('2026-11-10T04:30:00Z'); // 9 nov, 23:30 en Colombia.
  return { ...base, consultar: new ConsultarAuditoriaQuery(base.auditoria) };
}

describe('ConsultarAuditoriaQuery (HU-CON-11)', () => {
  it('lista los movimientos del más reciente al más antiguo con los valores antes y después', async () => {
    const e = await entorno();
    const r = await e.consultar.execute(pagina, { actor: admin });
    expect(r.total).toBe(2);
    expect(r.items.map((i) => [i.entidad, i.usuario])).toEqual([
      ['pago_vendedor', 'u-contador'],
      ['venta_contable', 'sistema-marketplace'],
    ]);
    expect(r.items[0]).toMatchObject({
      entidadId: 'pago-1',
      accion: 'REGISTRAR',
      correlationId: 'corr-1',
      valoresAnteriores: { cuentas: [{ periodo: '2026-10-Q1', saldoPendiente: '90000.00' }] },
      valoresNuevos: { pago: { valor: '40000.00' } },
    });
  });

  it('filtra por entidad, usuario y rango de días en hora de Colombia', async () => {
    const e = await entorno();
    const por = async (f: object) =>
      (await e.consultar.execute({ ...pagina, ...f }, { actor: admin })).items.map(
        (i) => i.entidad,
      );
    expect(await por({ entidad: 'venta_contable' })).toEqual(['venta_contable']);
    expect(await por({ usuario: 'u-contador' })).toEqual(['pago_vendedor']);
    expect(await por({ entidadId: 'pago-1' })).toEqual(['pago_vendedor']);
    // 23:30 del 9 de noviembre en Colombia ya es 10 de noviembre en UTC.
    expect(await por({ desde: '2026-11-09', hasta: '2026-11-09' })).toEqual(['pago_vendedor']);
    expect(await por({ desde: '2026-11-10' })).toEqual([]);
    expect(await por({ hasta: '2026-10-31' })).toEqual(['venta_contable']);
  });

  it('solo el administrador financiero la consulta y valida el rango', async () => {
    const e = await entorno();
    await expect(e.consultar.execute(pagina, { actor: contador })).rejects.toBeInstanceOf(
      NoAutorizadoError,
    );
    await expect(
      e.consultar.execute(
        { ...pagina, desde: '2026-11-10', hasta: '2026-11-01' },
        { actor: admin },
      ),
    ).rejects.toThrow(/posterior/);
    await expect(
      e.consultar.execute({ ...pagina, desde: '2026-02-30' }, { actor: admin }),
    ).rejects.toThrow(/Fecha inválida/);
  });
});
