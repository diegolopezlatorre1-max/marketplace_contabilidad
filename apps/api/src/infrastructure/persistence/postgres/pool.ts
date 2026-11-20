import pg from 'pg';

/** Todo lo que puede ejecutar SQL: el pool o un cliente dentro de una transacción. */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// NUMERIC (oid 1700) se devuelve como string: nunca se convierte a number.
pg.types.setTypeParser(1700, (v) => v);
// DATE (oid 1082) se devuelve como 'AAAA-MM-DD': convertirlo a Date lo desplazaría por la zona horaria.
pg.types.setTypeParser(1082, (v) => v);

/**
 * TLS hacia PostgreSQL (DATABASE_SSL):
 *  - disable   → sin TLS (PostgreSQL local / CI).
 *  - verify    → TLS validando el certificado; con DATABASE_SSL_CA (PEM) valida contra esa CA
 *                (p. ej. el certificado que Supabase publica en Database Settings → SSL).
 *  - no-verify → TLS sin validar el certificado (solo si no se dispone de la CA).
 */
export const MODOS_SSL = ['disable', 'verify', 'no-verify'] as const;
export type ModoSsl = (typeof MODOS_SSL)[number];

export interface OpcionesPool {
  ssl?: ModoSsl | undefined;
  /** Certificado de la CA en formato PEM (contenido, no ruta). */
  ca?: string | undefined;
}

export function opcionesSsl({ ssl = 'disable', ca }: OpcionesPool): pg.PoolConfig['ssl'] {
  if (ssl === 'disable') return false;
  if (ssl === 'no-verify') return { rejectUnauthorized: false };
  // Las variables de entorno suelen guardar el PEM con "\n" literales.
  return ca
    ? { rejectUnauthorized: true, ca: ca.replace(/\\n/g, '\n') }
    : { rejectUnauthorized: true };
}

/** Lee DATABASE_SSL y DATABASE_SSL_CA (scripts que no pasan por loadConfig). */
export function opcionesPoolDesdeEntorno(env: NodeJS.ProcessEnv = process.env): OpcionesPool {
  const ssl = env.DATABASE_SSL?.trim() || 'disable';
  if (!MODOS_SSL.includes(ssl as ModoSsl)) {
    throw new Error(`DATABASE_SSL inválido: use ${MODOS_SSL.join(', ')}`);
  }
  return { ssl: ssl as ModoSsl, ca: env.DATABASE_SSL_CA?.trim() || undefined };
}

export function createPool(connectionString: string, opciones: OpcionesPool = {}): pg.Pool {
  return new pg.Pool({
    connectionString,
    ssl: opcionesSsl(opciones),
    max: 10,
    idleTimeoutMillis: 30_000,
    application_name: 'contabilidad-api',
  });
}
