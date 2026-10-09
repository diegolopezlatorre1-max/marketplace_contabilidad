import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, inject } from 'vitest';
import { createPool } from '../../src/infrastructure/persistence/postgres/pool';
import { migrate } from '../../src/infrastructure/persistence/postgres/migrator';
import { setTestPool } from './db';

// La URL la resuelve globalSetup.ts (BD local/CI o contenedor de Testcontainers).
const pool = createPool(inject('testDatabaseUrl'));
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

beforeAll(async () => {
  await migrate(pool, migrationsDir);
  setTestPool(pool);
});

afterAll(async () => {
  await pool.end();
});
