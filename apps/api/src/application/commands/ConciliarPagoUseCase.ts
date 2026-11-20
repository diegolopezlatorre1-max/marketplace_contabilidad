import { randomUUID } from 'node:crypto';
import {
  ConciliacionDuplicadaError,
  PoliticaConciliacion,
} from '../../domain/conciliacion/Conciliacion';
import { PagoInexistenteError } from '../../domain/conciliacion/PagoRecibido';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { ConciliacionResumen } from '../ports/out/ConciliacionRepository';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';
import {
  guardarConciliacion,
  prepararConciliacion,
  type DependenciasConciliacion,
  type OrdenSolicitada,
} from './conciliacion/operaciones';

export interface ConciliarPagoEntrada {
  pagoId: string;
  ordenes: OrdenSolicitada[];
}

/**
 * HU-CON-04: el contador relaciona un pago recibido con una o varias órdenes. La
 * diferencia decide el estado (CONCILIADA / PENDIENTE) y queda auditada.
 */
export class ConciliarPagoUseCase implements UseCase<ConciliarPagoEntrada, ConciliacionResumen> {
  private readonly deps: DependenciasConciliacion;

  constructor(
    private readonly uow: UnitOfWork,
    clock: Clock,
    politica: PoliticaConciliacion = new PoliticaConciliacion(),
    generarId: () => string = randomUUID,
  ) {
    this.deps = { clock, politica, generarId };
  }

  async execute(
    entrada: ConciliarPagoEntrada,
    ctx: ContextoEjecucion,
  ): Promise<ConciliacionResumen> {
    exigirRol(ctx.actor, ['CONTADOR']);
    return this.uow.run(async (repos) => {
      // Bloqueado: dos conciliaciones simultáneas del mismo pago se serializan.
      const pago = await repos.pagosRecibidos.obtenerParaConciliar(entrada.pagoId);
      if (!pago) throw new PagoInexistenteError(entrada.pagoId);
      if (await repos.conciliaciones.existeParaPago(pago.id)) {
        throw new ConciliacionDuplicadaError(pago.referenciaPasarela);
      }
      const conciliacion = await prepararConciliacion(repos, pago, entrada.ordenes, this.deps, ctx);
      await guardarConciliacion(repos, conciliacion, ctx);
      return { ...conciliacion.toJSON(), fechaPago: pago.fecha.toISOString() };
    });
  }
}
