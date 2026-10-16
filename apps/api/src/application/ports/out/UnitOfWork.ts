import type { AuditLogger } from './AuditLogger';
import type { ComisionRepository } from './ComisionRepository';
import type { ConciliacionRepository } from './ConciliacionRepository';
import type { ConfiguracionComisionRepository } from './ConfiguracionComisionRepository';
import type { CuentaPorPagarRepository } from './CuentaPorPagarRepository';
import type { EventPublisher } from './EventPublisher';
import type { InboxRepository } from './InboxRepository';
import type { PagoRecibidoRepository } from './PagoRecibidoRepository';
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
  pagosRecibidos: PagoRecibidoRepository;
  conciliaciones: ConciliacionRepository;
}

/** Ejecuta un trabajo de forma atómica: todo se confirma o todo se revierte. */
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
