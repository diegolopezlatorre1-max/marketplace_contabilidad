import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/infrastructure/persistence/postgres/pool';
import { migrate } from '../src/infrastructure/persistence/postgres/migrator';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
// --test aplica las migraciones sobre TEST_DATABASE_URL.
const url = process.argv.includes('--test')
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (!url) {
  console.error('Defina DATABASE_URL (o TEST_DATABASE_URL con --test) en apps/api/.env');
  process.exit(1);
}

const pool = createPool(url);
try {
  const { aplicadas } = await migrate(pool, dir);
  console.log(
    aplicadas.length
      ? `Migraciones aplicadas:\n${aplicadas.map((m) => `  - ${m}`).join('\n')}`
      : 'La base de datos ya está al día.',
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
