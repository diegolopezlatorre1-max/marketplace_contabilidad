import type { EscrowPedido } from '../../domain/escrow/EscrowPedido';
import { DomainError } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { EscrowRepository } from '../ports/out/EscrowRepository';
import { exigirRol } from '../security';

/** GET /escrow/{pedido_id}: estado del dinero de un pedido (solo ADMIN). */
export class ObtenerEscrowQuery implements UseCase<
  { pedidoId: string },
  ReturnType<EscrowPedido['toJSON']>
> {
  constructor(
    private readonly escrow: Pick<EscrowRepository, 'obtener'>,
    private readonly clock: Clock,
  ) {}

  async execute(
    entrada: { pedidoId: string },
    ctx: ContextoEjecucion,
  ): Promise<ReturnType<EscrowPedido['toJSON']>> {
    exigirRol(ctx.actor, ['ADMIN']);
    const pedidoId = entrada.pedidoId.trim();
    const escrow = await this.escrow.obtener(pedidoId);
    if (!escrow) {
      throw new DomainError('NO_ENCONTRADO', `El pedido ${pedidoId} no tiene registro de escrow`);
    }
    return escrow.toJSON(this.clock.now());
  }
}
