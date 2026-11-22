import type { Query } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { DatabaseHealth } from '../ports/out/DatabaseHealth';
import type { EstadoOutbox, OutboxMonitor } from '../ports/out/OutboxMonitor';

export interface EstadoModulo {
  status: 'ok' | 'degradado';
  checks: { baseDeDatos: 'ok' | 'error' };
  /** Eventos salientes pendientes y en dead-letter (solo si la base de datos responde). */
  outbox?: EstadoOutbox;
  fecha: Date;
}

/** Caso de uso de verificación que atraviesa todas las capas (criterio de salida de la Fase 1). */
export class ObtenerEstadoModulo implements Query<void, EstadoModulo> {
  constructor(
    private readonly db: DatabaseHealth,
    private readonly clock: Clock,
    private readonly outbox?: OutboxMonitor,
  ) {}

  async execute(): Promise<EstadoModulo> {
    const dbOk = await this.db.ping();
    // Los eventos en dead-letter se informan pero no degradan el estado: el servicio sigue sano.
    const outbox =
      dbOk && this.outbox ? await this.outbox.contar().catch(() => undefined) : undefined;
    return {
      status: dbOk ? 'ok' : 'degradado',
      checks: { baseDeDatos: dbOk ? 'ok' : 'error' },
      ...(outbox ? { outbox } : {}),
      fecha: this.clock.now(),
    };
  }
}
