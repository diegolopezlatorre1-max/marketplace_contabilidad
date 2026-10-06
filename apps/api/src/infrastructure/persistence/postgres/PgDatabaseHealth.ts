import type { DatabaseHealth } from '../../../application/ports/out/DatabaseHealth';
import type { Queryable } from './pool';

export class PgDatabaseHealth implements DatabaseHealth {
  constructor(private readonly db: Queryable) {}

  async ping(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
