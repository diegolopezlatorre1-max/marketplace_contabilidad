import type pg from 'pg';

let pool: pg.Pool | undefined;

export function setTestPool(p: pg.Pool): void {
  pool = p;
}

export function testPool(): pg.Pool {
  if (!pool) throw new Error('Pool de pruebas no inicializado (ver test/integration/setup.ts)');
  return pool;
}

/** Vacía las tablas del módulo entre pruebas. */
export async function limpiarTablas(): Promise<void> {
  const { rows } = await testPool().query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'contabilidad'`,
  );
  if (rows.length === 0) return;
  const tablas = rows.map((r) => `contabilidad."${r.tablename}"`).join(', ');
  await testPool().query(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE`);
}

/**
 * Escrow: marca como entregados el 1 de enero de 2026 (LIBERADOS) los pedidos indicados, o todos los
 * que tienen ventas. Se escribe directo en la tabla para no agregar registros de auditoría.
 */
export async function liberarEscrow(pedidos?: readonly string[]): Promise<void> {
  await testPool().query(
    `INSERT INTO contabilidad.escrow_pedido (pedido_id, entregado_en, liberable_desde, actualizado_en)
     SELECT DISTINCT numero_orden, timestamptz '2026-01-01T00:00:00Z', timestamptz '2026-01-04T00:00:00Z', now()
       FROM contabilidad.venta_contable
      WHERE $1::text[] IS NULL OR numero_orden = ANY($1::text[])
     ON CONFLICT (pedido_id) DO NOTHING`,
    [pedidos ?? null],
  );
}
