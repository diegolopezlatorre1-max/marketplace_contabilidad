import { randomUUID } from 'node:crypto';
import { ConfiguracionComision } from '../../domain/comision/ConfiguracionComision';
import { fechaContable, parseFechaContable, Porcentaje } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { leerEstadoComision, type EstadoComision } from '../queries/ObtenerComisionVigenteQuery';
import { exigirRol } from '../security';

export interface ConfigurarComisionEntrada {
  /** String decimal, p. ej. "12.5". */
  porcentaje: string;
  /** Primer día de la nueva vigencia (AAAA-MM-DD). Puede ser retroactiva. */
  vigenteDesde: string;
}

/**
 * HU-CON-09: registra un nuevo porcentaje GLOBAL. En una sola transacción bloquea
 * la vigencia abierta, la cierra el día anterior al inicio de la nueva, inserta
 * la nueva y deja la auditoría. Las ventas ya registradas no cambian.
 */
export class ConfigurarComisionUseCase implements UseCase<
  ConfigurarComisionEntrada,
  EstadoComision
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly generarId: () => string = randomUUID,
  ) {}

  async execute(
    entrada: ConfigurarComisionEntrada,
    ctx: ContextoEjecucion,
  ): Promise<EstadoComision> {
    exigirRol(ctx.actor, ['ADMIN_FINANCIERO']);
    const nueva = ConfiguracionComision.crear({
      id: this.generarId(),
      porcentaje: Porcentaje.of(entrada.porcentaje),
      alcance: 'GLOBAL',
      vigenteDesde: parseFechaContable(entrada.vigenteDesde),
      creadoPor: ctx.actor.id,
    });

    return this.uow.run(async ({ configuracionComision: repo, auditoria }) => {
      const anterior = await repo.abiertaPara('GLOBAL', null);
      const cerrada = anterior?.cerrarEn(nueva.vigenteDesde);
      if (cerrada) await repo.actualizarCierre(cerrada);
      await repo.guardar(nueva);

      await auditoria.registrar({
        entidad: 'configuracion_comision',
        entidadId: nueva.id,
        accion: 'CONFIGURAR',
        usuario: ctx.actor.id,
        valoresAnteriores: { vigente: anterior?.toJSON() ?? null },
        valoresNuevos: {
          vigente: nueva.toJSON(),
          anteriorCerradaHasta: cerrada?.vigenteHasta ?? null,
        },
        ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      });

      return leerEstadoComision(repo, fechaContable(this.clock.now()));
    });
  }
}
