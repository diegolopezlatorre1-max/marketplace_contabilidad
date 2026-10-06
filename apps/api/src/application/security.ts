import { DomainError } from '../domain/shared';

export type Rol = 'CONTADOR' | 'ADMIN_FINANCIERO' | 'SISTEMA';

/** Usuario (persona o sistema) que ejecuta un caso de uso. */
export interface Actor {
  id: string;
  nombre: string;
  roles: readonly Rol[];
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
