import { randomUUID } from 'node:crypto';
import { PagoVendedor } from '../../domain/pagoVendedor/PagoVendedor';
import { DomainError, Money, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { PagoVendedorRegistrado } from '../ports/out/PagoVendedorRepository';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';

export const EVENTO_PAGO_VENDEDOR_REGISTRADO = 'contabilidad.pago-vendedor.registrado';

export interface RegistrarPagoVendedorEntrada {
  vendedorId: string;
  /** Valor transferido al vendedor. */
  valor: string;
  /** Referencia bancaria; no se puede repetir para el mismo vendedor. */
  referencia: string;
  /** Soporte del pago (comprobante, enlace...). */
  soporte?: string | undefined;
  /** Día del pago (AAAA-MM-DD, hora de Colombia); por defecto, hoy. */
  fecha?: string | undefined;
}

export class ReferenciaPagoDuplicadaError extends DomainError {
  constructor(vendedorId: string, referencia: string) {
    super(
      'REFERENCIA_DUPLICADA',
      `Ya existe un pago al vendedor ${vendedorId} con la referencia ${referencia}`,
    );
    this.name = 'ReferenciaPagoDuplicadaError';
  }
}

/**
 * HU-CON-10: el contador registra el pago hecho a un vendedor. En una sola transacción descuenta
 * el saldo a favor del marketplace, aplica el pago FIFO a sus cuentas (D-06), guarda el pago con
 * su detalle, deja auditoría y publica contabilidad.pago-vendedor.registrado.
 */
export class RegistrarPagoVendedorUseCase implements UseCase<
  RegistrarPagoVendedorEntrada,
  PagoVendedorRegistrado
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly generarId: () => string = randomUUID,
  ) {}

  async execute(
    entrada: RegistrarPagoVendedorEntrada,
    ctx: ContextoEjecucion,
  ): Promise<PagoVendedorRegistrado> {
    exigirRol(ctx.actor, ['CONTADOR']);
    const ahora = this.clock.now();
    // Un día contable se registra al mediodía de Colombia para no cambiar de día por la zona.
    const fecha = entrada.fecha
      ? new Date(`${parseFechaContable(entrada.fecha)}T12:00:00-05:00`)
      : ahora;
    const valor = Money.of(entrada.valor);
    const vendedorId = entrada.vendedorId.trim();
    const referencia = entrada.referencia.trim();

    return this.uow.run(async (repos) => {
      // Dos pagos simultáneos al mismo vendedor no pueden superar su saldo.
      await repos.inbox.bloquear(`pago-vendedor:${vendedorId}`);
      if (await repos.pagosVendedor.existeReferencia(vendedorId, referencia)) {
        throw new ReferenciaPagoDuplicadaError(vendedorId, referencia);
      }
      const cuentas = await repos.cuentasPorPagar.pendientesParaActualizar(vendedorId);
      const saldoAFavor = await repos.pagosVendedor.saldoAFavorDisponible(vendedorId);
      const antes = cuentas.map((c) => ({
        periodo: c.periodo.codigo,
        valorPagado: c.valorPagado.toString(),
        saldoPendiente: c.saldoPendiente.toString(),
        estado: c.estado,
      }));

      const pago = PagoVendedor.registrar({
        id: this.generarId(),
        vendedorId,
        fecha,
        valor,
        referencia,
        soporte: entrada.soporte,
        cuentas,
        saldoAFavorDisponible: saldoAFavor,
        registradoPor: ctx.actor.id,
        ahora,
      });

      const aplicadas = new Set(pago.aplicaciones.map((a) => a.periodo.codigo));
      for (const cuenta of cuentas.filter((c) => aplicadas.has(c.periodo.codigo))) {
        await repos.cuentasPorPagar.guardar(cuenta);
      }
      await repos.pagosVendedor.guardar(pago, ahora);

      const json = pago.toJSON();
      await repos.auditoria.registrar({
        entidad: 'pago_vendedor',
        entidadId: pago.id,
        accion: 'REGISTRAR',
        usuario: ctx.actor.id,
        valoresAnteriores: {
          saldoAFavor: saldoAFavor.toString(),
          cuentas: antes.filter((c) => aplicadas.has(c.periodo)),
        },
        valoresNuevos: { pago: json },
        ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      });
      await repos.outbox.publicar({
        tipo: EVENTO_PAGO_VENDEDOR_REGISTRADO,
        payload: {
          pagoId: pago.id,
          vendedorId: pago.vendedorId,
          fecha: json.fecha,
          valor: json.valor,
          saldoAFavorAplicado: json.saldoAFavorAplicado,
          referencia: pago.referencia,
          cuentas: json.aplicaciones,
        },
      });

      return aPagoVendedorRegistrado(pago, ahora);
    });
  }
}

/** Modelo de lectura de un pago recién registrado (la respuesta de POST /pagos-vendedor). */
export function aPagoVendedorRegistrado(
  pago: PagoVendedor,
  registradoEn: Date,
): PagoVendedorRegistrado {
  const j = pago.toJSON();
  return {
    ...j,
    aplicaciones: j.aplicaciones.map((a) => ({
      ...a,
      // Una cuenta a la que se aplica un pago siempre queda PARCIAL o PAGADO.
      estado: a.estado === 'PAGADO' ? 'PAGADO' : 'PARCIAL',
    })),
    registradoEn: registradoEn.toISOString(),
  };
}
