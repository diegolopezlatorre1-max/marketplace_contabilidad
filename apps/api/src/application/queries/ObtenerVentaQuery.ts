import { DomainError } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { SellersGateway } from '../ports/out/SellersGateway';
import type { VentaContableRepository, VentaDetalle } from '../ports/out/VentaContableRepository';
import { exigirRol } from '../security';
import { conNombreVendedor } from './nombreVendedor';

/** HU-CON-02: detalle de una venta con bruto, % aplicado, comisión y neto. */
export class ObtenerVentaQuery implements UseCase<
  string,
  VentaDetalle & { vendedorNombre: string }
> {
  constructor(
    private readonly ventas: VentaContableRepository,
    private readonly vendedores: SellersGateway,
  ) {}

  async execute(
    id: string,
    ctx: ContextoEjecucion,
  ): Promise<VentaDetalle & { vendedorNombre: string }> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const venta = await this.ventas.obtener(id);
    if (!venta) throw new DomainError('NO_ENCONTRADO', `No existe la venta ${id}`);
    const [conNombre] = await conNombreVendedor([venta], this.vendedores);
    return conNombre!;
  }
}
