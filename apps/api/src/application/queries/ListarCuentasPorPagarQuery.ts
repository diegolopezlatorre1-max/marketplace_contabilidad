import { Periodo } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type {
  CuentaPorPagarRepository,
  CuentaPorPagarResumen,
  FiltroCuentasPorPagar,
} from '../ports/out/CuentaPorPagarRepository';
import { exigirRol } from '../security';

/** HU-CON-03: saldos por vendedor y quincena, filtrados por periodo, estado y vendedor. */
export class ListarCuentasPorPagarQuery implements UseCase<
  FiltroCuentasPorPagar,
  CuentaPorPagarResumen[]
> {
  constructor(private readonly cuentas: CuentaPorPagarRepository) {}

  async execute(
    filtro: FiltroCuentasPorPagar,
    ctx: ContextoEjecucion,
  ): Promise<CuentaPorPagarResumen[]> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    const periodo = filtro.periodo ? Periodo.parse(filtro.periodo).codigo : undefined;
    return this.cuentas.listar({ ...filtro, periodo });
  }
}
