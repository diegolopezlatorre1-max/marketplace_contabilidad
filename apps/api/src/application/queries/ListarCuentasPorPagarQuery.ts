import { Periodo } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  CuentaPorPagarRepository,
  CuentaPorPagarResumen,
  FiltroCuentasPorPagar,
} from '../ports/out/CuentaPorPagarRepository';
import type { SellersGateway } from '../ports/out/SellersGateway';
import { alcanceVendedor, exigirRol } from '../security';
import { conNombreVendedor } from './nombreVendedor';

type CuentaConNombre = CuentaPorPagarResumen & { vendedorNombre: string };

/** HU-CON-03: saldos por vendedor y quincena, filtrados por periodo, estado y vendedor. */
export class ListarCuentasPorPagarQuery implements UseCase<
  FiltroCuentasPorPagar,
  CuentaConNombre[]
> {
  constructor(
    private readonly cuentas: CuentaPorPagarRepository,
    private readonly vendedores: SellersGateway,
  ) {}

  async execute(filtro: FiltroCuentasPorPagar, ctx: ContextoEjecucion): Promise<CuentaConNombre[]> {
    // ADMIN ve todas las cuentas; un VENDEDOR solo las suyas.
    exigirRol(ctx.actor, ['ADMIN', 'VENDEDOR']);
    const vendedorId = alcanceVendedor(ctx.actor, filtro.vendedorId);
    const periodo = filtro.periodo ? Periodo.parse(filtro.periodo).codigo : undefined;
    return conNombreVendedor(
      await this.cuentas.listar({ ...filtro, vendedorId, periodo }),
      this.vendedores,
    );
  }
}
