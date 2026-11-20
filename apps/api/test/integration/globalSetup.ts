import 'dotenv/config';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/**
 * Resuelve la BD de las pruebas de integración una sola vez por ejecución:
 * - TEST_DATABASE_URL (PostgreSQL local o el servicio de CI), o
 * - un contenedor PostgreSQL 16 con Testcontainers cuando se ejecuta con
 *   `--mode docker` (npm run test:integration:docker) o no hay TEST_DATABASE_URL.
 */
export default async function setup(project: TestProject) {
  const usarContenedor = project.viteConfig.mode === 'docker' || !process.env.TEST_DATABASE_URL;

  if (!usarContenedor) {
    const url = process.env.TEST_DATABASE_URL as string;
    if (url === process.env.DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL debe ser distinta de DATABASE_URL: las pruebas borran datos.',
      );
    }
    project.provide('testDatabaseUrl', url);
    return;
  }

  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  let contenedor;
  try {
    contenedor = await new PostgreSqlContainer('postgres:16')
      .withDatabase('marketplace_contabilidad_test')
      .start();
  } catch (error) {
    throw new Error(
      'No se pudo iniciar PostgreSQL con Testcontainers (¿Docker está instalado y en ejecución?). ' +
        'Alternativa: definir TEST_DATABASE_URL en apps/api/.env y ejecutar npm run db:create.\n' +
        (error as Error).message,
    );
  }
  project.provide('testDatabaseUrl', contenedor.getConnectionUri());

  return async () => {
    await contenedor.stop();
  };
}
