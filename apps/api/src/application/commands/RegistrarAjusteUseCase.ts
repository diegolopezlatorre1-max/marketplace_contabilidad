import { randomUUID } from 'node:crypto';
import type { TipoAjuste } from '../../domain/ajuste/AjusteContable';
import { DomainError, Money, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { AjusteRegistrado } from '../ports/out/AjusteContableRepository';
import type { Clock } from '../ports/out/Clock';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';
import { aplicarAjuste } from './aplicarAjuste';

export interface RegistrarAjusteEntrada {
  ventaId: string;
  tipo: TipoAjuste;
  motivo: string;
  /** Valor devuelto (obligatorio en DEVOLUCION). */
  valor?: string | undefined;
  /** Día del ajuste (AAAA-MM-DD, hora de Colombia); por defecto, hoy. */
  fecha?: string | undefined;
}

/** HU-CON-06: el contador registra una devolución o cancelación sobre una venta existente. */
export class RegistrarAjusteUseCase implements UseCase<RegistrarAjusteEntrada, AjusteRegistrado> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly generarId: () => string = randomUUID,
  ) {}

  async execute(
    entrada: RegistrarAjusteEntrada,
    ctx: ContextoEjecucion,
  ): Promise<AjusteRegistrado> {
    exigirRol(ctx.actor, ['CONTADOR']);
    const ahora = this.clock.now();
    // Un día contable se registra al mediodía de Colombia para no cambiar de día por la zona.
    const fecha = entrada.fecha
      ? new Date(`${parseFechaContable(entrada.fecha)}T12:00:00-05:00`)
      : ahora;
    const valor = entrada.valor === undefined ? undefined : Money.of(entrada.valor);

    return this.uow.run(async (repos) => {
      const venta = await repos.ventas.obtener(entrada.ventaId);
      if (!venta) {
        throw new DomainError('ORDEN_INEXISTENTE', `No existe la venta ${entrada.ventaId}`);
      }
      return aplicarAjuste(
        repos,
        venta,
        { tipo: entrada.tipo, motivo: entrada.motivo, fecha, valor, origen: 'MANUAL' },
        ctx,
        ahora,
        this.generarId(),
      );
    });
  }
}
