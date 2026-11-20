import type { ConfiguracionComision } from '../../domain/comision/ConfiguracionComision';
import { fechaContable, parseFechaContable, type FechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { ConfiguracionComisionRepository } from '../ports/out/ConfiguracionComisionRepository';
import { exigirRol } from '../security';

/** Porcentaje GLOBAL vigente en una fecha y el historial de vigencias. */
export interface EstadoComision {
  fecha: FechaContable;
  vigente: ConfiguracionComision | null;
  historial: ConfiguracionComision[];
}

/** Lee el estado de la comisión GLOBAL (lo usan la consulta y el comando tras configurar). */
export async function leerEstadoComision(
  repo: ConfiguracionComisionRepository,
  fecha: FechaContable,
): Promise<EstadoComision> {
  const [vigente, historial] = await Promise.all([
    repo.vigenteEn('GLOBAL', null, fecha),
    repo.historial('GLOBAL', null),
  ]);
  return { fecha, vigente, historial };
}

export class ObtenerComisionVigenteQuery implements UseCase<
  { fecha?: string | undefined },
  EstadoComision
> {
  constructor(
    private readonly repo: ConfiguracionComisionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    entrada: { fecha?: string | undefined },
    ctx: ContextoEjecucion,
  ): Promise<EstadoComision> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const fecha = entrada.fecha
      ? parseFechaContable(entrada.fecha)
      : fechaContable(this.clock.now());
    return leerEstadoComision(this.repo, fecha);
  }
}
