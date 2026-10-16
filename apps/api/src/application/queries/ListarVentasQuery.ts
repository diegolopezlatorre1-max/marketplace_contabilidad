import { InvalidValueError, parseFechaContable, Periodo } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { SellersGateway } from '../ports/out/SellersGateway';
import type {
  PaginaVentas,
  VentaContableRepository,
  VentaRegistrada,
} from '../ports/out/VentaContableRepository';
import { exigirRol } from '../security';
import { conNombreVendedor } from './nombreVendedor';

export interface ListarVentasEntrada {
  desde?: string | undefined;
  hasta?: string | undefined;
  vendedorId?: string | undefined;
  periodo?: string | undefined;
  page: number;
  size: number;
}

export type PaginaVentasConNombre = Omit<PaginaVentas, 'items'> & {
  items: Array<VentaRegistrada & { vendedorNombre: string }>;
};

/** HU-CON-01: ventas registradas con su comisión, filtradas por fecha contable, quincena y vendedor. */
export class ListarVentasQuery implements UseCase<ListarVentasEntrada, PaginaVentasConNombre> {
  constructor(
    private readonly ventas: VentaContableRepository,
    private readonly vendedores: SellersGateway,
  ) {}

  async execute(
    entrada: ListarVentasEntrada,
    ctx: ContextoEjecucion,
  ): Promise<PaginaVentasConNombre> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const desde = entrada.desde ? parseFechaContable(entrada.desde) : undefined;
    const hasta = entrada.hasta ? parseFechaContable(entrada.hasta) : undefined;
    if (desde && hasta && desde > hasta) {
      throw new InvalidValueError('La fecha "desde" no puede ser posterior a "hasta"');
    }
    const periodo = entrada.periodo ? Periodo.parse(entrada.periodo).codigo : undefined;
    const pagina = await this.ventas.listar({ ...entrada, desde, hasta, periodo });
    return { ...pagina, items: await conNombreVendedor(pagina.items, this.vendedores) };
  }
}
