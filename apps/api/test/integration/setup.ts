import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll } from 'vitest';
import { createPool } from '../../src/infrastructure/persistence/postgres/pool';
import { migrate } from '../../src/infrastructure/persistence/postgres/migrator';
import { setTestPool } from './db';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'Las pruebas de integración requieren TEST_DATABASE_URL (apps/api/.env). Ejecute antes: npm run db:create',
  );
}
if (url === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL debe ser distinta de DATABASE_URL: las pruebas borran datos.');
}

const pool = createPool(url);
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
