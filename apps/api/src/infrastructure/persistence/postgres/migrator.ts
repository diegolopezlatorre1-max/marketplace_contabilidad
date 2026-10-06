import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

export interface ResultadoMigracion {
  aplicadas: string[];
  pendientesAntes: number;
}

/**
 * Ejecuta migraciones SQL versionadas (NNN_descripcion.sql) en orden, una por
 * transacción, registrándolas en public.contabilidad_migraciones con su checksum.
 * Una migración ya aplicada no se puede modificar: se crea una nueva.
 */
export async function migrate(pool: pg.Pool, dir: string): Promise<ResultadoMigracion> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.contabilidad_migraciones (
      nombre      TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const archivos = (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const { rows } = await pool.query<{ nombre: string; checksum: string }>(
    'SELECT nombre, checksum FROM public.contabilidad_migraciones',
  );
  const aplicadas = new Map(rows.map((r) => [r.nombre, r.checksum]));

  const pendientes: Array<{ nombre: string; sql: string; checksum: string }> = [];
  for (const nombre of archivos) {
    const sql = await readFile(path.join(dir, nombre), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previo = aplicadas.get(nombre);
    if (previo && previo !== checksum) {
      throw new Error(
        `La migración ${nombre} fue modificada después de aplicarse. Cree una nueva.`,
      );
    }
    if (!previo) pendientes.push({ nombre, sql, checksum });
  }

  const resultado: ResultadoMigracion = { aplicadas: [], pendientesAntes: pendientes.length };
  for (const m of pendientes) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      await client.query(
        'INSERT INTO public.contabilidad_migraciones (nombre, checksum) VALUES ($1, $2)',
        [m.nombre, m.checksum],
      );
      await client.query('COMMIT');
      resultado.aplicadas.push(m.nombre);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${m.nombre}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
  return resultado;
}
