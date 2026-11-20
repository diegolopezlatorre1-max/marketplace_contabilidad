import { describe, expect, it } from 'vitest';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ListarCuentasPorPagarQuery } from '../../../src/application/queries/ListarCuentasPorPagarQuery';
import { ObtenerVentaQuery } from '../../../src/application/queries/ObtenerVentaQuery';
import { ResumenSaldoVendedorQuery } from '../../../src/application/queries/ResumenSaldoVendedorQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { DomainError } from '../../../src/domain/shared';
import { MockSellersGateway } from '../../../src/infrastructure/integration/sellers/MockSellersGateway';
import { comisionGlobal, crearBaseEnMemoria } from './enMemoria';

const sistema: Actor = { id: 'sistema', nombre: 'Órdenes', roles: ['SISTEMA'] };
const contador: Actor = { id: 'u-contador', nombre: 'Contador', roles: ['CONTADOR'] };
const ctx = { actor: contador, correlationId: 'corr-1' };
const reloj = { now: () => new Date('2026-10-05T15:00:00Z') };
const vendedores = new MockSellersGateway({ 'V-1': 'Vendedor Uno' });

/** Registra órdenes de un vendedor por línea: [numeroOrden, vendedorId, valorBruto, fecha]. */
async function entorno(ordenes: Array<[string, string, string, string]>) {
  const { db, repos, uow } = crearBaseEnMemoria();
  db.datos.configuraciones.push(comisionGlobal('10'));
  let n = 0;
  const registrar = new RegistrarVentaConfirmadaUseCase(uow, reloj, () => `venta-${++n}`);
  for (const [numeroOrden, vendedorId, valorBruto, fecha] of ordenes) {
    await registrar.execute(
      {
        eventId: `evt-${numeroOrden}`,
        tipo: 'orden.confirmada',
        numeroOrden,
        fecha,
        estado: 'CONFIRMADA',
        lineas: [{ vendedorId, valorBruto }],
      },
      { actor: sistema, correlationId: 'corr' },
    );
  }
  return repos;
}

describe('ObtenerVentaQuery (HU-CON-02)', () => {
  it('entrega bruto, % aplicado, comisión, neto y el nombre del vendedor', async () => {
    const repos = await entorno([['ORD-1', 'V-1', '100000.00', '2026-10-05T09:00:00-05:00']]);
    const venta = await new ObtenerVentaQuery(repos.ventas, vendedores).execute('venta-1', ctx);
    expect(venta).toMatchObject({
      numeroOrden: 'ORD-1',
      vendedorNombre: 'Vendedor Uno',
      valorBruto: '100000.00',
      porcentajeAplicado: '10.0000',
      comision: '10000.00',
      valorNeto: '90000.00',
      estadoOrigen: 'CONFIRMADA',
    });
  });

  it('una venta inexistente es NO_ENCONTRADO y el rol SISTEMA no puede consultar', async () => {
    const repos = await entorno([]);
    const query = new ObtenerVentaQuery(repos.ventas, vendedores);
    await expect(query.execute('no-existe', ctx)).rejects.toMatchObject({
      constructor: DomainError,
      code: 'NO_ENCONTRADO',
    });
    await expect(
      query.execute('venta-1', { actor: sistema, correlationId: 'c' }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
  });
});

describe('ResumenSaldoVendedorQuery (HU-CON-03)', () => {
  it('netos de 90.000 y 45.000 del mismo vendedor suman un saldo de 135.000', async () => {
    const repos = await entorno([
      ['ORD-1', 'V-1', '100000.00', '2026-10-05T09:00:00-05:00'],
      ['ORD-2', 'V-1', '50000.00', '2026-10-06T09:00:00-05:00'],
      ['ORD-3', 'V-9', '10000.00', '2026-10-06T10:00:00-05:00'],
    ]);
    const resumen = await new ResumenSaldoVendedorQuery(repos.cuentasPorPagar, vendedores).execute(
      { periodo: '2026-10-Q1' },
      ctx,
    );
    expect(resumen).toEqual([
      {
        vendedorId: 'V-1',
        vendedorNombre: 'Vendedor Uno',
        cuentas: 1,
        totalNeto: '135000.00',
        valorPagado: '0.00',
        saldoPendiente: '135000.00',
      },
      // Vendedor desconocido para Vendedores: se muestra su id.
      expect.objectContaining({
        vendedorId: 'V-9',
        vendedorNombre: 'V-9',
        saldoPendiente: '9000.00',
      }),
    ]);
  });

  it('sin periodo suma todas las quincenas del vendedor', async () => {
    const repos = await entorno([
      ['ORD-1', 'V-1', '100000.00', '2026-10-05T09:00:00-05:00'],
      ['ORD-2', 'V-1', '50000.00', '2026-10-20T09:00:00-05:00'],
    ]);
    const [saldo] = await new ResumenSaldoVendedorQuery(repos.cuentasPorPagar, vendedores).execute(
      {},
      ctx,
    );
    expect(saldo).toMatchObject({ cuentas: 2, saldoPendiente: '135000.00' });
  });

  it('el listado de cuentas también trae el nombre del vendedor', async () => {
    const repos = await entorno([['ORD-1', 'V-1', '100000.00', '2026-10-05T09:00:00-05:00']]);
    const cuentas = await new ListarCuentasPorPagarQuery(repos.cuentasPorPagar, vendedores).execute(
      {},
      ctx,
    );
    expect(cuentas[0]).toMatchObject({
      vendedorNombre: 'Vendedor Uno',
      saldoPendiente: '90000.00',
    });
  });
});
