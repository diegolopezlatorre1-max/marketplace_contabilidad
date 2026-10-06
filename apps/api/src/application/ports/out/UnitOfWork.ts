import type { AuditLogger } from './AuditLogger';
import type { EventPublisher } from './EventPublisher';
import type { InboxRepository } from './InboxRepository';

/**
 * Repositorios que participan en una misma transacción.
 * Cada sprint agrega aquí sus repositorios (ventas, comisiones, cuentas por pagar...).
 */
export interface TransactionalRepositories {
  auditoria: AuditLogger;
  outbox: EventPublisher;
  inbox: InboxRepository;
}

/** Ejecuta un trabajo de forma atómica: todo se confirma o todo se revierte. */
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
