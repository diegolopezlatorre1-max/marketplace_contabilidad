import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/infrastructure/persistence/postgres/pool';
import { seed } from '../src/infrastructure/persistence/postgres/seeder';

// Los seeds son datos de ejemplo: nunca se cargan en producción.
if (process.env.NODE_ENV === 'production') {
  console.error('db:seed no está permitido con NODE_ENV=production');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL en apps/api/.env');
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seeds');
const pool = createPool(url);
try {
  const cargados = await seed(pool, dir);
  console.log(
    cargados.length
      ? `Seeds cargados:\n${cargados.map((s) => `  - ${s}`).join('\n')}`
      : 'No hay seeds para cargar.',
  );
} catch (error) {
  // Un fallo de conexión llega como AggregateError sin mensaje: se muestra el código.
  const e = error as NodeJS.ErrnoException;
  console.error(e.message || e.code || String(e));
  process.exitCode = 1;
} finally {
  await pool.end();
}
