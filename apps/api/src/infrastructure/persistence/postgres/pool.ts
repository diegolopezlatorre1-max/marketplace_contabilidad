import pg from 'pg';

/** Todo lo que puede ejecutar SQL: el pool o un cliente dentro de una transacción. */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// NUMERIC (oid 1700) se devuelve como string: nunca se convierte a number.
pg.types.setTypeParser(1700, (v) => v);
// DATE (oid 1082) se devuelve como 'AAAA-MM-DD': convertirlo a Date lo desplazaría por la zona horaria.
pg.types.setTypeParser(1082, (v) => v);

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    application_name: 'contabilidad-api',
  });
}
