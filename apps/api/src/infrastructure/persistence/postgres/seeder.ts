import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

/**
 * Carga los datos de desarrollo (NNN_descripcion.sql) en orden, todos en una sola
 * transacción. A diferencia de las migraciones, los seeds se ejecutan siempre:
 * cada archivo debe ser idempotente (ON CONFLICT DO NOTHING / WHERE NOT EXISTS).
 */
export async function seed(pool: pg.Pool, dir: string): Promise<string[]> {
  const archivos = (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const nombre of archivos) {
      const sql = await readFile(path.join(dir, nombre), 'utf8');
      try {
        await client.query(sql);
      } catch (error) {
        throw new Error(`Falló el seed ${nombre}: ${(error as Error).message}`);
      }
    }
    await client.query('COMMIT');
    return archivos;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
