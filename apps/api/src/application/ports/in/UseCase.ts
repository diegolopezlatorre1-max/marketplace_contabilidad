import type { Actor } from '../../security';

/** Contexto común de ejecución de un caso de uso. */
export interface ContextoEjecucion {
  actor: Actor;
  correlationId?: string;
}

/** Puerto de entrada: los adaptadores (HTTP, eventos) solo invocan casos de uso. */
export interface UseCase<Entrada, Salida> {
  execute(entrada: Entrada, ctx: ContextoEjecucion): Promise<Salida>;
}

/** Consulta sin actor obligatorio (p. ej. health check). */
export interface Query<Entrada, Salida> {
  execute(entrada: Entrada): Promise<Salida>;
}
