import { Periodo } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  CuentaPorPagarRepository,
  SaldoVendedor,
} from '../ports/out/CuentaPorPagarRepository';
import type { SellersGateway } from '../ports/out/SellersGateway';
import { exigirRol } from '../security';
import { conNombreVendedor } from './nombreVendedor';

type SaldoConNombre = SaldoVendedor & { vendedorNombre: string };

/** HU-CON-03: saldo pendiente por vendedor, de una quincena o de todas. */
export class ResumenSaldoVendedorQuery implements UseCase<
  { periodo?: string | undefined },
  SaldoConNombre[]
> {
  constructor(
    private readonly cuentas: CuentaPorPagarRepository,
    private readonly vendedores: SellersGateway,
  ) {}

  async execute(
    entrada: { periodo?: string | undefined },
    ctx: ContextoEjecucion,
  ): Promise<SaldoConNombre[]> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const periodo = entrada.periodo ? Periodo.parse(entrada.periodo).codigo : undefined;
    return conNombreVendedor(await this.cuentas.resumirPorVendedor(periodo), this.vendedores);
  }
}
