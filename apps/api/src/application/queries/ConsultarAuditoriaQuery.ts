import { InvalidValueError, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  AuditoriaRepository,
  FiltroAuditoria,
  PaginaAuditoria,
} from '../ports/out/AuditoriaRepository';
import { exigirRol } from '../security';

/**
 * HU-CON-11: consulta de la auditoría de movimientos contables por entidad, usuario y rango de
 * días (hora de Colombia). Solo el administrador financiero puede consultarla.
 */
export class ConsultarAuditoriaQuery implements UseCase<FiltroAuditoria, PaginaAuditoria> {
  constructor(private readonly auditoria: AuditoriaRepository) {}

  async execute(filtro: FiltroAuditoria, ctx: ContextoEjecucion): Promise<PaginaAuditoria> {
    exigirRol(ctx.actor, ['ADMIN_FINANCIERO']);
    const desde = filtro.desde ? parseFechaContable(filtro.desde) : undefined;
    const hasta = filtro.hasta ? parseFechaContable(filtro.hasta) : undefined;
    if (desde && hasta && desde > hasta) {
      throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    return this.auditoria.buscar({ ...filtro, desde, hasta });
  }
}
