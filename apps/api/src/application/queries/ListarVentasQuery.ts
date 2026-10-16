import { InvalidValueError, parseFechaContable } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { PaginaVentas, VentaContableRepository } from '../ports/out/VentaContableRepository';
import { exigirRol } from '../security';

export interface ListarVentasEntrada {
  desde?: string | undefined;
  hasta?: string | undefined;
  vendedorId?: string | undefined;
  page: number;
  size: number;
}

/** HU-CON-01: ventas registradas con su comisión, filtradas por fecha contable y vendedor. */
export class ListarVentasQuery implements UseCase<ListarVentasEntrada, PaginaVentas> {
  constructor(private readonly ventas: VentaContableRepository) {}

  async execute(entrada: ListarVentasEntrada, ctx: ContextoEjecucion): Promise<PaginaVentas> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const desde = entrada.desde ? parseFechaContable(entrada.desde) : undefined;
    const hasta = entrada.hasta ? parseFechaContable(entrada.hasta) : undefined;
    if (desde && hasta && desde > hasta) {
      throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    return this.ventas.listar({ ...entrada, desde, hasta });
  }
}
