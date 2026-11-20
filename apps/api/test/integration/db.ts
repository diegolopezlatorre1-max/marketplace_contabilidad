import type pg from 'pg';

let pool: pg.Pool | undefined;

export function setTestPool(p: pg.Pool): void {
  pool = p;
}

export function testPool(): pg.Pool {
  if (!pool) throw new Error('Pool de pruebas no inicializado (ver test/integration/setup.ts)');
  return pool;
}

/** Vacía las tablas del módulo entre pruebas. */
export async function limpiarTablas(): Promise<void> {
  const { rows } = await testPool().query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'contabilidad'`,
  );
  if (rows.length === 0) return;
  const tablas = rows.map((r) => `contabilidad."${r.tablename}"`).join(', ');
  await testPool().query(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE`);
}
