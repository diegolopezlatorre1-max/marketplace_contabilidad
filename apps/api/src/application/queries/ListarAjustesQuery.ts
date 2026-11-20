import { InvalidValueError, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  AjusteContableRepository,
  FiltroAjustes,
  PaginaAjustes,
} from '../ports/out/AjusteContableRepository';
import { exigirRol } from '../security';

/** HU-CON-06: historial de ajustes por venta, vendedor y rango de fechas del ajuste. */
export class ListarAjustesQuery implements UseCase<FiltroAjustes, PaginaAjustes> {
  constructor(private readonly ajustes: AjusteContableRepository) {}

  async execute(filtro: FiltroAjustes, ctx: ContextoEjecucion): Promise<PaginaAjustes> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const desde = filtro.desde ? parseFechaContable(filtro.desde) : undefined;
    const hasta = filtro.hasta ? parseFechaContable(filtro.hasta) : undefined;
    if (desde && hasta && desde > hasta) {
      throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    return this.ajustes.listar({ ...filtro, desde, hasta });
  }
}
