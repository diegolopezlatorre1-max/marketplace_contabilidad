import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../src/infrastructure/persistence/postgres/seeder';
import { limpiarTablas, testPool } from './db';

let dir: string;

beforeEach(async () => {
  await limpiarTablas();
  dir = await mkdtemp(path.join(tmpdir(), 'seeds-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const contarIgnorados = async () =>
  Number(
    (
      await testPool().query<{ n: string }>(
        'SELECT count(*) AS n FROM contabilidad.evento_ignorado',
      )
    ).rows[0]?.n,
  );

describe('seeds de desarrollo', () => {
  it('ejecuta los archivos en orden y puede repetirse sin duplicar datos', async () => {
    await writeFile(
      path.join(dir, '002_segundo.sql'),
      `INSERT INTO contabilidad.evento_ignorado (event_id, tipo, motivo, payload)
       SELECT 'seed-2', 'demo', 'seed', '{}'
       WHERE EXISTS (SELECT 1 FROM contabilidad.evento_ignorado WHERE event_id = 'seed-1')
         AND NOT EXISTS (SELECT 1 FROM contabilidad.evento_ignorado WHERE event_id = 'seed-2');`,
    );
    await writeFile(
      path.join(dir, '001_primero.sql'),
      `INSERT INTO contabilidad.evento_ignorado (event_id, tipo, motivo, payload)
       SELECT 'seed-1', 'demo', 'seed', '{}'
       WHERE NOT EXISTS (SELECT 1 FROM contabilidad.evento_ignorado WHERE event_id = 'seed-1');`,
    );
    await writeFile(path.join(dir, 'LEEME.md'), 'no es un seed');

    expect(await seed(testPool(), dir)).toEqual(['001_primero.sql', '002_segundo.sql']);
    await seed(testPool(), dir);
    expect(await contarIgnorados()).toBe(2);
  });

  it('si un archivo falla no deja datos parciales', async () => {
    await writeFile(
      path.join(dir, '001_ok.sql'),
      `INSERT INTO contabilidad.evento_ignorado (event_id, tipo, motivo, payload)
       VALUES ('seed-1', 'demo', 'seed', '{}');`,
    );
    await writeFile(path.join(dir, '002_roto.sql'), 'INSERT INTO tabla_inexistente VALUES (1);');

    await expect(seed(testPool(), dir)).rejects.toThrow('Falló el seed 002_roto.sql');
    expect(await contarIgnorados()).toBe(0);
  });
});
