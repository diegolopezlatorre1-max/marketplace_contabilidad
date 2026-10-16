import type { AuditLogger } from './AuditLogger';
import type { ComisionRepository } from './ComisionRepository';
import type { ConfiguracionComisionRepository } from './ConfiguracionComisionRepository';
import type { CuentaPorPagarRepository } from './CuentaPorPagarRepository';
import type { EventPublisher } from './EventPublisher';
import type { InboxRepository } from './InboxRepository';
import type { VentaContableRepository } from './VentaContableRepository';

/**
 * Repositorios que participan en una misma transacción.
 * Cada sprint agrega aquí sus repositorios (ventas, comisiones, cuentas por pagar...).
 */
export interface TransactionalRepositories {
  auditoria: AuditLogger;
  outbox: EventPublisher;
  inbox: InboxRepository;
  configuracionComision: ConfiguracionComisionRepository;
  ventas: VentaContableRepository;
  comisiones: ComisionRepository;
  cuentasPorPagar: CuentaPorPagarRepository;
}

/** Ejecuta un trabajo de forma atómica: todo se confirma o todo se revierte. */
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
