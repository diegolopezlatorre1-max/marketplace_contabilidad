import type pg from 'pg';
import type {
  TransactionalRepositories,
  UnitOfWork,
} from '../../../application/ports/out/UnitOfWork';
import { PgAuditLogger } from './PgAuditLogger';
import { PgInboxRepository } from './PgInboxRepository';
import { PgOutboxPublisher } from './PgOutboxPublisher';
import type { Queryable } from './pool';

/** Construye los repositorios sobre una conexión concreta (la de la transacción). */
export function createRepositories(db: Queryable): TransactionalRepositories {
  return {
    auditoria: new PgAuditLogger(db),
    outbox: new PgOutboxPublisher(db),
    inbox: new PgInboxRepository(db),
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
