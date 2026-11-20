import { DomainError } from '../domain/shared';

/**
 * Roles de aplicación del marketplace (GUIA_EQUIPO_6, sección 1):
 *   ADMIN     → configura comisiones, consulta auditoría y opera las funciones contables.
 *   VENDEDOR  → consulta solo su propio estado, cuentas y pagos recibidos.
 *   COMPRADOR → no accede a funciones internas de contabilidad.
 * Los módulos que envían eventos (Órdenes, Pagos, PQR) no son roles: se autentican como
 * servicio (ver Actor.servicio).
 */
export const ROLES = ['ADMIN', 'COMPRADOR', 'VENDEDOR'] as const;
export type Rol = (typeof ROLES)[number];

/** Usuario (persona) o módulo del marketplace que ejecuta un caso de uso. */
export interface Actor {
  id: string;
  nombre: string;
  roles: readonly Rol[];
  /** Vendedor que representa el usuario (solo con el rol VENDEDOR). */
  vendedorId?: string;
  /** Módulo de origen cuando el actor es un servicio (p. ej. "ordenes", "pagos"). */
  servicio?: string;
}

export class NoAutorizadoError extends DomainError {
  constructor(message = 'No tiene permisos para realizar esta operación') {
    super('NO_AUTORIZADO', message);
    this.name = 'NoAutorizadoError';
  }
}

export function tieneAlgunRol(actor: Actor, roles: readonly Rol[]): boolean {
  return actor.roles.some((r) => roles.includes(r));
}

/** Defensa en profundidad: los casos de uso también validan el rol, no solo el middleware HTTP. */
export function exigirRol(actor: Actor, roles: readonly Rol[]): void {
  if (!tieneAlgunRol(actor, roles)) throw new NoAutorizadoError();
}

export function esServicio(actor: Actor): boolean {
  return Boolean(actor.servicio);
}

/** Solo los módulos del marketplace (autenticados como servicio) pueden enviar eventos. */
export function exigirServicio(actor: Actor): void {
  if (!esServicio(actor)) {
    throw new NoAutorizadoError('Solo los módulos del marketplace pueden enviar eventos');
  }
}

/**
 * Resuelve qué vendedor puede consultar el actor:
 *  - ADMIN: el solicitado (o ninguno = todos).
 *  - VENDEDOR: siempre el suyo; pedir otro vendedor es 403.
 *  - Cualquier otro: 403.
 */
export function alcanceVendedor(actor: Actor, solicitado?: string): string | undefined {
  if (tieneAlgunRol(actor, ['ADMIN'])) return solicitado;
  if (tieneAlgunRol(actor, ['VENDEDOR']) && actor.vendedorId) {
    if (solicitado !== undefined && solicitado.trim() !== actor.vendedorId) {
      throw new NoAutorizadoError('Un vendedor solo puede consultar su propia información');
    }
    return actor.vendedorId;
  }
  throw new NoAutorizadoError();
}
