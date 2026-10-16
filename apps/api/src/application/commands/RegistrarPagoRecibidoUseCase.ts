import { randomUUID } from 'node:crypto';
import { PoliticaConciliacion } from '../../domain/conciliacion/Conciliacion';
import type { OrigenPago } from '../../domain/conciliacion/PagoRecibido';
import { InvalidValueError } from '../../domain/shared';
import type { ContextoEjecucion, UseCase } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { UnitOfWork } from '../ports/out/UnitOfWork';
import { exigirRol } from '../security';
import {
  estadoDelPago,
  registrarPago,
  type DependenciasConciliacion,
} from './conciliacion/operaciones';

/** Evento pago.recibido v1 (docs/fase0/contratos-integracion.md), ya validado. */
export interface PagoRecibidoEntrada {
  eventId: string;
  tipo: string;
  referenciaPasarela: string;
  /** ISO 8601 con zona horaria. */
  fecha: string;
  valor: string;
  origen: OrigenPago;
  ordenes?: string[] | undefined;
}

export interface ResultadoPagoRecibido {
  eventId: string;
  resultado: 'PROCESADO' | 'YA_PROCESADO';
  detalle?: string;
  pagoId?: string;
  estado?: 'SIN_CONCILIAR' | 'CONCILIADO' | 'PENDIENTE';
}

/**
 * HU-CON-04: registra un pago informado por el módulo de Pagos (idempotente por
 * eventId y por referencia). Si trae órdenes, lo concilia automáticamente.
 */
export class RegistrarPagoRecibidoUseCase implements UseCase<
  PagoRecibidoEntrada,
  ResultadoPagoRecibido
> {
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
    evento: PagoRecibidoEntrada,
    ctx: ContextoEjecucion,
  ): Promise<ResultadoPagoRecibido> {
    exigirRol(ctx.actor, ['SISTEMA']);
    const fecha = new Date(evento.fecha);
    if (Number.isNaN(fecha.getTime()))
      throw new InvalidValueError(`Fecha inválida: ${evento.fecha}`);

    return this.uow.run(async (repos) => {
      // Un reenvío simultáneo del mismo evento espera aquí y luego ve YA_PROCESADO.
      await repos.inbox.bloquear(`evento:${evento.eventId}`);
      if (await repos.inbox.yaProcesado(evento.eventId)) {
        return { eventId: evento.eventId, resultado: 'YA_PROCESADO' };
      }
      const registrado = await registrarPago(
        repos,
        {
          referenciaPasarela: evento.referenciaPasarela,
          fecha,
          valor: evento.valor,
          origen: evento.origen,
          eventId: evento.eventId,
          ordenes: evento.ordenes,
        },
        this.deps,
        ctx,
      );
      await repos.inbox.marcarProcesado(evento.eventId, evento.tipo, evento);
      return {
        eventId: evento.eventId,
        resultado: 'PROCESADO',
        pagoId: registrado.pago.id,
        estado: estadoDelPago(registrado),
        ...(registrado.motivoSinConciliar ? { detalle: registrado.motivoSinConciliar } : {}),
      };
    });
  }
}
