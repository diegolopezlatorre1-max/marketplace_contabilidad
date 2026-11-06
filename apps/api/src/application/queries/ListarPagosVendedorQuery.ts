import { InvalidValueError, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  FiltroPagosVendedor,
  PagoVendedorRepository,
  PaginaPagosVendedor,
} from '../ports/out/PagoVendedorRepository';
import { exigirRol } from '../security';

/** HU-CON-10: historial de pagos a vendedores por vendedor y rango de fechas del pago. */
export class ListarPagosVendedorQuery implements UseCase<FiltroPagosVendedor, PaginaPagosVendedor> {
  constructor(private readonly pagos: PagoVendedorRepository) {}

  async execute(filtro: FiltroPagosVendedor, ctx: ContextoEjecucion): Promise<PaginaPagosVendedor> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const desde = filtro.desde ? parseFechaContable(filtro.desde) : undefined;
    const hasta = filtro.hasta ? parseFechaContable(filtro.hasta) : undefined;
    if (desde && hasta && desde > hasta) {
      throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    return this.pagos.listar({ ...filtro, desde, hasta });
  }
}
