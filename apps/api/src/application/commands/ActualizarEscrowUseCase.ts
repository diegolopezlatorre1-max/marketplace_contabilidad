import { EscrowPedido } from '../../domain/escrow/EscrowPedido';
import { DomainError, InvalidValueError } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol, exigirServicio } from '../security';

export const EVENTO_ESCROW_ACTUALIZADO = 'contabilidad.escrow.actualizado';

export type AccionEscrow = 'MARCAR_ENTREGA' | 'BLOQUEAR' | 'DESBLOQUEAR';

export interface ActualizarEscrowEntrada {
  pedidoId: string;
  accion: AccionEscrow;
  /** MARCAR_ENTREGA: instante de la entrega (ISO 8601); por defecto, ahora. */
  fechaEntrega?: string | undefined;
  /** BLOQUEAR: referencia de la PQR. DESBLOQUEAR: por qué se levanta (obligatorio). */
  motivo?: string | undefined;
}

export type ResultadoEscrow = ReturnType<EscrowPedido['toJSON']> & {
  resultado: 'ACTUALIZADO' | 'SIN_CAMBIOS';
};

const ACCION_AUDITORIA: Record<AccionEscrow, string> = {
  MARCAR_ENTREGA: 'MARCAR_ENTREGA',
  BLOQUEAR: 'BLOQUEAR',
  DESBLOQUEAR: 'DESBLOQUEAR',
};

/**
 * Escrow (GUIA_EQUIPO_6, sección 6):
 *  - MARCAR_ENTREGA: lo envía el módulo de Órdenes al confirmarse la entrega. La retención de
 *    72 h se libera sola al cumplirse el plazo: no hace falta ninguna llamada.
 *  - BLOQUEAR: lo envía un módulo del marketplace (servicio; por definir cuál) ante una PQR.
 *  - DESBLOQUEAR: lo hace manualmente el ADMIN de Contabilidad, con un motivo obligatorio.
 * Idempotente: repetir una operación ya aplicada responde SIN_CAMBIOS sin auditar ni publicar.
 */
export class ActualizarEscrowUseCase implements UseCase<ActualizarEscrowEntrada, ResultadoEscrow> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    entrada: ActualizarEscrowEntrada,
    ctx: ContextoEjecucion,
  ): Promise<ResultadoEscrow> {
    if (entrada.accion === 'DESBLOQUEAR') {
      exigirRol(ctx.actor, ['ADMIN']);
      if (!entrada.motivo?.trim()) {
        throw new InvalidValueError('El motivo del desbloqueo es obligatorio');
      }
    } else {
      exigirServicio(ctx.actor);
    }
    const ahora = this.clock.now();
    const fechaEntrega = entrada.fechaEntrega ? new Date(entrada.fechaEntrega) : ahora;
    if (Number.isNaN(fechaEntrega.getTime())) {
      throw new InvalidValueError('La fecha de entrega es inválida');
    }

    return this.uow.run(async (repos) => {
      const pedidoId = entrada.pedidoId.trim();
      // Dos avisos simultáneos del mismo pedido se procesan uno tras otro.
      await repos.inbox.bloquear(`escrow:${pedidoId}`);
      const existente = await repos.escrow.obtener(pedidoId);
      if (!existente && entrada.accion === 'DESBLOQUEAR') {
        throw new DomainError('NO_ENCONTRADO', `El pedido ${pedidoId} no tiene registro de escrow`);
      }
      const escrow = existente ?? EscrowPedido.nuevo(pedidoId, ahora);
      const antes = existente ? existente.toJSON(ahora) : null;

      const cambio =
        entrada.accion === 'MARCAR_ENTREGA'
          ? escrow.marcarEntrega(fechaEntrega, ahora)
          : entrada.accion === 'BLOQUEAR'
            ? escrow.bloquear(entrada.motivo, ahora)
            : escrow.desbloquear(ahora);

      const despues = escrow.toJSON(ahora);
      if (!cambio) return { ...despues, resultado: 'SIN_CAMBIOS' };

      await repos.escrow.guardar(escrow);
      await repos.auditoria.registrar({
        entidad: 'escrow_pedido',
        entidadId: pedidoId,
        accion: ACCION_AUDITORIA[entrada.accion],
        usuario: ctx.actor.id,
        valoresAnteriores: antes,
        valoresNuevos: {
          ...despues,
          ...(entrada.motivo?.trim() ? { motivoOperacion: entrada.motivo.trim() } : {}),
        },
        ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      });
      await repos.outbox.publicar({
        tipo: EVENTO_ESCROW_ACTUALIZADO,
        payload: { accion: entrada.accion, ...despues },
      });
      return { ...despues, resultado: 'ACTUALIZADO' };
    });
  }
}
