import { describe, expect, it } from 'vitest';
import {
  ActualizarEscrowUseCase,
  EVENTO_ESCROW_ACTUALIZADO,
} from '../../../src/application/commands/ActualizarEscrowUseCase';
import { RegistrarAjusteUseCase } from '../../../src/application/commands/RegistrarAjusteUseCase';
import { RegistrarPagoVendedorUseCase } from '../../../src/application/commands/RegistrarPagoVendedorUseCase';
import { RegistrarVentaConfirmadaUseCase } from '../../../src/application/commands/RegistrarVentaConfirmadaUseCase';
import { ObtenerEscrowQuery } from '../../../src/application/queries/ObtenerEscrowQuery';
import { NoAutorizadoError, type Actor } from '../../../src/application/security';
import { DomainError } from '../../../src/domain/shared';
import { comisionGlobal, crearBaseEnMemoria, liberarEscrow } from './enMemoria';

const ordenes: Actor = {
  id: 'servicio:ordenes',
  nombre: 'Órdenes',
  roles: [],
  servicio: 'ordenes',
};
const pqr: Actor = { id: 'servicio:pqr', nombre: 'PQR', roles: [], servicio: 'pqr' };
const admin: Actor = { id: 'u-admin', nombre: 'Admin', roles: ['ADMIN'] };

/** Reloj controlable: las pruebas avanzan el tiempo para cumplir las 72 h. */
function relojEn(iso: string) {
  let actual = new Date(iso);
  return {
    now: () => actual,
    avanzarHoras: (h: number) => {
      actual = new Date(actual.getTime() + h * 3_600_000);
    },
  };
}

/**
 * Comisión 10 %. V-1: ORD-1 (100.000 → neto 90.000, 2026-10-Q1) y ORD-2 (50.000 → neto 45.000,
 * 2026-10-Q2). Se le deben 135.000.
 */
async function entorno() {
  const reloj = relojEn('2026-11-10T15:00:00Z');
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
      { actor: ordenes },
    );
  }
  let p = 0;
  const escrow = new ActualizarEscrowUseCase(base.uow, reloj);
  const pagar = new RegistrarPagoVendedorUseCase(base.uow, reloj, () => `pago-${++p}`);
  return {
    ...base,
    reloj,
    escrow,
    obtener: new ObtenerEscrowQuery(base.repos.escrow, reloj),
    ajustar: new RegistrarAjusteUseCase(base.uow, reloj, () => `ajuste-${++p}`),
    pagar: (valor: string, referencia = `TRF-${p + 1}`) =>
      pagar.execute({ vendedorId: 'V-1', valor, referencia }, { actor: admin }),
  };
}

describe('ActualizarEscrowUseCase (GUIA_EQUIPO_6, escrow)', () => {
  it('marca la entrega, audita y publica; repetirla es SIN_CAMBIOS', async () => {
    const e = await entorno();
    const r = await e.escrow.execute(
      { pedidoId: 'ORD-1', accion: 'MARCAR_ENTREGA' },
      { actor: ordenes, correlationId: 'corr-1' },
    );
    expect(r).toMatchObject({
      pedidoId: 'ORD-1',
      estado: 'RETENIDO',
      liberableDesde: '2026-11-13T15:00:00.000Z',
      resultado: 'ACTUALIZADO',
    });
    expect(e.db.datos.auditoria.at(-1)).toMatchObject({
      entidad: 'escrow_pedido',
      entidadId: 'ORD-1',
      accion: 'MARCAR_ENTREGA',
      usuario: 'servicio:ordenes',
      valoresAnteriores: null,
      correlationId: 'corr-1',
    });
    expect(e.db.datos.outbox.at(-1)?.tipo).toBe(EVENTO_ESCROW_ACTUALIZADO);

    const auditados = e.db.datos.auditoria.length;
    const otra = await e.escrow.execute(
      { pedidoId: 'ORD-1', accion: 'MARCAR_ENTREGA' },
      { actor: ordenes },
    );
    expect(otra.resultado).toBe('SIN_CAMBIOS');
    expect(e.db.datos.auditoria).toHaveLength(auditados);
  });

  it('un módulo bloquea por PQR y el ADMIN desbloquea con el motivo en la auditoría', async () => {
    const e = await entorno();
    const b = await e.escrow.execute(
      { pedidoId: 'ORD-1', accion: 'BLOQUEAR', motivo: 'PQR-15' },
      { actor: pqr },
    );
    expect(b).toMatchObject({ estado: 'BLOQUEADO', motivoBloqueo: 'PQR-15' });
    const d = await e.escrow.execute(
      { pedidoId: 'ORD-1', accion: 'DESBLOQUEAR', motivo: 'resuelta a favor del vendedor' },
      { actor: admin },
    );
    expect(d).toMatchObject({ estado: 'SIN_ENTREGA', resultado: 'ACTUALIZADO' });
    expect(e.db.datos.auditoria.at(-1)).toMatchObject({
      accion: 'DESBLOQUEAR',
      usuario: 'u-admin',
      valoresAnteriores: { estado: 'BLOQUEADO' },
      valoresNuevos: { motivoOperacion: 'resuelta a favor del vendedor' },
    });
  });

  it('el desbloqueo es solo del ADMIN, exige motivo y un pedido con registro', async () => {
    const e = await entorno();
    await e.escrow.execute({ pedidoId: 'ORD-1', accion: 'BLOQUEAR' }, { actor: pqr });
    await expect(
      e.escrow.execute(
        { pedidoId: 'ORD-1', accion: 'DESBLOQUEAR', motivo: 'x' },
        { actor: ordenes },
      ),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
    for (const motivo of [undefined, '   ']) {
      await expect(
        e.escrow.execute({ pedidoId: 'ORD-1', accion: 'DESBLOQUEAR', motivo }, { actor: admin }),
      ).rejects.toThrow(/motivo/);
    }
    await expect(
      e.escrow.execute({ pedidoId: 'ORD-9', accion: 'DESBLOQUEAR', motivo: 'x' }, { actor: admin }),
    ).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(e.db.datos.escrow.find((x) => x.pedidoId === 'ORD-1')?.bloqueado).toBe(true);
  });

  it('marcar la entrega y bloquear son de los módulos (servicio); la consulta es del ADMIN', async () => {
    const e = await entorno();
    await expect(
      e.escrow.execute({ pedidoId: 'ORD-1', accion: 'BLOQUEAR' }, { actor: admin }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
    await e.escrow.execute({ pedidoId: 'ORD-1', accion: 'MARCAR_ENTREGA' }, { actor: ordenes });
    expect(await e.obtener.execute({ pedidoId: 'ORD-1' }, { actor: admin })).toMatchObject({
      estado: 'RETENIDO',
    });
    await expect(
      e.obtener.execute({ pedidoId: 'ORD-1' }, { actor: ordenes }),
    ).rejects.toBeInstanceOf(NoAutorizadoError);
    await expect(e.obtener.execute({ pedidoId: 'ORD-9' }, { actor: admin })).rejects.toMatchObject({
      code: 'NO_ENCONTRADO',
    });
  });

  it('rechaza una fecha de entrega futura sin guardar nada', async () => {
    const e = await entorno();
    await expect(
      e.escrow.execute(
        { pedidoId: 'ORD-1', accion: 'MARCAR_ENTREGA', fechaEntrega: '2026-12-01T00:00:00Z' },
        { actor: ordenes },
      ),
    ).rejects.toThrow(/futura/);
    expect(e.db.datos.escrow).toHaveLength(0);
  });
});

describe('Pago a vendedor con escrow (HU-CON-10 + escrow)', () => {
  it('un pedido sin entrega retiene el pago hasta que Órdenes la marca y pasan 72 h', async () => {
    const e = await entorno();
    // Ninguna orden tiene entrega: los 135.000 están retenidos.
    const error = await e.pagar('0.01').catch((x: unknown) => x);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: 'SALDO_RETENIDO_ESCROW' });
    expect((error as Error).message).toContain('135000.00');

    for (const pedidoId of ['ORD-1', 'ORD-2']) {
      await e.escrow.execute({ pedidoId, accion: 'MARCAR_ENTREGA' }, { actor: ordenes });
    }
    await expect(e.pagar('0.01')).rejects.toMatchObject({ code: 'SALDO_RETENIDO_ESCROW' });
    e.reloj.avanzarHoras(72);
    expect((await e.pagar('135000.00')).valor).toBe('135000.00');
  });

  it('un pedido RETENIDO no se paga hasta que pasan las 72 h', async () => {
    const e = await entorno();
    liberarEscrow(e.db, ['ORD-2']);
    await e.escrow.execute({ pedidoId: 'ORD-1', accion: 'MARCAR_ENTREGA' }, { actor: ordenes });

    // Se deben 135.000, pero 90.000 (ORD-1) están retenidos: hoy solo se pueden pagar 45.000.
    const error = await e.pagar('50000.00').catch((x: unknown) => x);
    expect(error).toMatchObject({ code: 'SALDO_RETENIDO_ESCROW' });
    expect((error as Error).message).toContain('90000.00');

    // El pago disponible va a la quincena de ORD-2 y no toca la de ORD-1, que es más antigua.
    const pago = await e.pagar('45000.00');
    expect(pago.aplicaciones).toMatchObject([{ periodo: '2026-10-Q2', valorAplicado: '45000.00' }]);

    e.reloj.avanzarHoras(72);
    const despues = await e.pagar('90000.00');
    expect(despues.aplicaciones).toMatchObject([
      { periodo: '2026-10-Q1', valorAplicado: '90000.00' },
    ]);
  });

  it('un pedido BLOQUEADO por PQR no se paga hasta que el ADMIN lo desbloquea', async () => {
    const e = await entorno();
    liberarEscrow(e.db);
    await e.escrow.execute({ pedidoId: 'ORD-2', accion: 'BLOQUEAR' }, { actor: pqr });
    await expect(e.pagar('135000.00')).rejects.toMatchObject({ code: 'SALDO_RETENIDO_ESCROW' });
    // Pagar más de lo que se debe sigue siendo PAGO_EXCEDE_SALDO.
    await expect(e.pagar('135000.01')).rejects.toMatchObject({ code: 'PAGO_EXCEDE_SALDO' });

    expect((await e.pagar('90000.00')).valor).toBe('90000.00');
    await e.escrow.execute(
      { pedidoId: 'ORD-2', accion: 'DESBLOQUEAR', motivo: 'PQR resuelta' },
      { actor: admin },
    );
    expect((await e.pagar('45000.00')).valor).toBe('45000.00');
  });

  it('lo retenido descuenta los ajustes ya registrados sobre la venta', async () => {
    const e = await entorno();
    liberarEscrow(e.db, ['ORD-2']);
    // Devolución de 20.000 sobre ORD-1: el neto de la venta baja de 90.000 a 72.000.
    await e.ajustar.execute(
      { ventaId: 'venta-1', tipo: 'DEVOLUCION', motivo: 'devolución parcial', valor: '20000.00' },
      { actor: admin },
    );
    // ORD-1 sigue sin entrega. Se deben 72.000 + 45.000 = 117.000; 72.000 retenidos → hoy 45.000.
    await expect(e.pagar('45000.01')).rejects.toMatchObject({ code: 'SALDO_RETENIDO_ESCROW' });
    expect((await e.pagar('45000.00')).valor).toBe('45000.00');
  });
});
