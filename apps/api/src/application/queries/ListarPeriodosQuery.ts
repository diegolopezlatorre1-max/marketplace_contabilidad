import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { VentaContableRepository } from '../ports/out/VentaContableRepository';
import { exigirRol } from '../security';

/** Quincenas con ventas registradas (selector de periodo de la interfaz). */
export class ListarPeriodosQuery implements UseCase<void, string[]> {
  constructor(private readonly ventas: VentaContableRepository) {}

  async execute(_entrada: void, ctx: ContextoEjecucion): Promise<string[]> {
    exigirRol(ctx.actor, ['CONTADOR', 'ADMIN_FINANCIERO']);
    return this.ventas.listarPeriodos();
  }
}
