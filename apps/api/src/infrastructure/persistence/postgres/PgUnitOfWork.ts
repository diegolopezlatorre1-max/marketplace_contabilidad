import type pg from 'pg';
import type {
  TransactionalRepositories,
  UnitOfWork,
} from '../../../application/ports/out/UnitOfWork';
import { PgAjusteContableRepository } from './PgAjusteContableRepository';
import { PgAuditLogger } from './PgAuditLogger';
import { PgComisionRepository } from './PgComisionRepository';
import { PgConfiguracionComisionRepository } from './PgConfiguracionComisionRepository';
import { PgCuentaPorPagarRepository } from './PgCuentaPorPagarRepository';
import { PgInboxRepository } from './PgInboxRepository';
import { PgOutboxPublisher } from './PgOutboxPublisher';
import { PgVentaContableRepository } from './PgVentaContableRepository';
import type { Queryable } from './pool';

/** Construye los repositorios sobre una conexión concreta (la de la transacción). */
export function createRepositories(db: Queryable): TransactionalRepositories {
  return {
    auditoria: new PgAuditLogger(db),
    outbox: new PgOutboxPublisher(db),
    inbox: new PgInboxRepository(db),
    configuracionComision: new PgConfiguracionComisionRepository(db),
    ventas: new PgVentaContableRepository(db),
    comisiones: new PgComisionRepository(db),
    cuentasPorPagar: new PgCuentaPorPagarRepository(db),
    ajustes: new PgAjusteContableRepository(db),
  };
}

export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: pg.Pool) {}

  async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(createRepositories(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
