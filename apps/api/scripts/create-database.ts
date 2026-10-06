import 'dotenv/config';
import pg from 'pg';

/**
 * Crea las bases de datos de desarrollo y de pruebas si no existen,
 * conectándose a la BD "postgres" del mismo servidor.
 */
const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter((u): u is string =>
  Boolean(u),
);

if (urls.length === 0) {
  console.error('Defina DATABASE_URL y TEST_DATABASE_URL en apps/api/.env');
  process.exit(1);
}

for (const url of urls) {
  const destino = new URL(url);
  const nombre = destino.pathname.replace(/^\//, '');
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) {
    console.error(`Nombre de base de datos no permitido: ${nombre}`);
    process.exitCode = 1;
    continue;
  }
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      nombre,
    ]);
    if (rowCount) {
      console.log(`La base de datos ${nombre} ya existe.`);
    } else {
      await client.query(`CREATE DATABASE ${nombre} ENCODING 'UTF8'`);
      console.log(`Base de datos ${nombre} creada.`);
    }
  } catch (error) {
    console.error(`Error con ${nombre}: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
