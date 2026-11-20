import type { Query } from '../ports/in/UseCase';
import type { Clock } from '../ports/out/Clock';
import type { DatabaseHealth } from '../ports/out/DatabaseHealth';

export interface EstadoModulo {
  status: 'ok' | 'degradado';
  checks: { baseDeDatos: 'ok' | 'error' };
  fecha: Date;
}

/** Caso de uso de verificación que atraviesa todas las capas (criterio de salida de la Fase 1). */
export class ObtenerEstadoModulo implements Query<void, EstadoModulo> {
  constructor(
    private readonly db: DatabaseHealth,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<EstadoModulo> {
    const dbOk = await this.db.ping();
    return {
      status: dbOk ? 'ok' : 'degradado',
      checks: { baseDeDatos: dbOk ? 'ok' : 'error' },
      fecha: this.clock.now(),
    };
  }
}
