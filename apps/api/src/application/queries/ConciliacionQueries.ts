import { InvalidValueError, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  ConciliacionRepository,
  ConciliacionResumen,
  FiltroConciliaciones,
} from '../ports/out/ConciliacionRepository';
import type {
  FiltroPagosRecibidos,
  PagoRecibidoRepository,
  PagoRecibidoResumen,
} from '../ports/out/PagoRecibidoRepository';
import { exigirRol } from '../security';

const LECTORES = ['CONTADOR', 'ADMIN_FINANCIERO'] as const;

/** Valida el rango de fechas contables (AAAA-MM-DD, inclusive). */
function conRango<F extends { desde?: string | undefined; hasta?: string | undefined }>(
  filtro: F,
): F {
  const desde = filtro.desde ? parseFechaContable(filtro.desde) : undefined;
  const hasta = filtro.hasta ? parseFechaContable(filtro.hasta) : undefined;
  if (desde && hasta && desde > hasta) {
    throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
  }
  return { ...filtro, desde, hasta };
}

/** HU-CON-04: bandeja de pagos recibidos con su estado de conciliación. */
export class ListarPagosRecibidosQuery implements UseCase<
  FiltroPagosRecibidos,
  PagoRecibidoResumen[]
> {
  constructor(private readonly pagos: PagoRecibidoRepository) {}

  async execute(filtro: FiltroPagosRecibidos, ctx: ContextoEjecucion) {
    exigirRol(ctx.actor, LECTORES);
    return this.pagos.listar(conRango(filtro));
  }
}

/** HU-CON-04b: conciliaciones con su diferencia, filtradas por estado y fechas. */
export class ListarConciliacionesQuery implements UseCase<
  FiltroConciliaciones,
  ConciliacionResumen[]
> {
  constructor(private readonly conciliaciones: ConciliacionRepository) {}

  async execute(filtro: FiltroConciliaciones, ctx: ContextoEjecucion) {
    exigirRol(ctx.actor, LECTORES);
    return this.conciliaciones.listar(conRango(filtro));
  }
}

/** HU-CON-04b: detalle de una conciliación (null si no existe). */
export class ObtenerConciliacionQuery implements UseCase<
  { id: string },
  ConciliacionResumen | null
> {
  constructor(private readonly conciliaciones: ConciliacionRepository) {}

  async execute({ id }: { id: string }, ctx: ContextoEjecucion) {
    exigirRol(ctx.actor, LECTORES);
    return this.conciliaciones.obtener(id);
  }
}
