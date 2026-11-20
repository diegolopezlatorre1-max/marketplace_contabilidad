import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { limpiarTablas, testPool } from './db';

beforeEach(limpiarTablas);

describe('Fase 3 - RLS en el esquema contabilidad (GUIA_EQUIPO_6, sección 4)', () => {
  it('todas las tablas del esquema y la tabla de migraciones tienen RLS habilitado', async () => {
    const { rows } = await testPool().query<{ tabla: string; rls: boolean; forzado: boolean }>(
      `SELECT n.nspname || '.' || c.relname AS tabla,
              c.relrowsecurity AS rls,
              c.relforcerowsecurity AS forzado
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND (n.nspname = 'contabilidad'
               OR (n.nspname = 'public' AND c.relname = 'contabilidad_migraciones'))
        ORDER BY 1`,
    );
    expect(rows.length).toBeGreaterThan(10);
    // Una migración nueva que cree una tabla sin RLS hace fallar esta prueba.
    expect(rows.filter((r) => !r.rls).map((r) => r.tabla)).toEqual([]);
    // Sin FORCE: el backend (dueño de las tablas) sigue operando sin políticas.
    expect(rows.filter((r) => r.forzado).map((r) => r.tabla)).toEqual([]);
  });

  it('el backend (dueño) lee y escribe; otro rol con permiso SELECT no ve ninguna fila', async () => {
    const cliente = await testPool().connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(
        `INSERT INTO contabilidad.auditoria (entidad, entidad_id, accion, usuario)
         VALUES ('prueba', '1', 'CREAR', 'u-admin')`,
      );
      const dueño = await cliente.query('SELECT count(*)::int AS n FROM contabilidad.auditoria');
      expect(dueño.rows[0].n).toBe(1);

      // Simula un rol como "authenticated" de Supabase al que alguien le diera permisos.
      await cliente.query('CREATE ROLE rls_prueba NOLOGIN');
      await cliente.query('GRANT USAGE ON SCHEMA contabilidad TO rls_prueba');
      await cliente.query('GRANT SELECT, INSERT ON contabilidad.auditoria TO rls_prueba');
      await cliente.query('SET LOCAL ROLE rls_prueba');

      const ajeno = await cliente.query('SELECT count(*)::int AS n FROM contabilidad.auditoria');
      expect(ajeno.rows[0].n).toBe(0);
      await expect(
        cliente.query(
          `INSERT INTO contabilidad.auditoria (entidad, entidad_id, accion, usuario)
           VALUES ('prueba', '2', 'CREAR', 'intruso')`,
        ),
      ).rejects.toMatchObject({ code: '42501' }); // insufficient_privilege (política RLS)
    } finally {
      // Deshace el rol, los permisos y los datos de la prueba.
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });

  it('con los roles de Supabase (anon, authenticated) la migración les retira todo acceso', async () => {
    const sql = await readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations/008_rls.sql'),
      'utf8',
    );
    const cliente = await testPool().connect();
    try {
      await cliente.query('BEGIN');
      for (const rol of ['anon', 'authenticated']) {
        const { rowCount } = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
          rol,
        ]);
        if (!rowCount) await cliente.query(`CREATE ROLE ${rol} NOLOGIN`);
        // Permisos como los que Supabase concede por defecto a los esquemas expuestos.
        await cliente.query(`GRANT USAGE ON SCHEMA contabilidad TO ${rol}`);
        await cliente.query(`GRANT ALL ON ALL TABLES IN SCHEMA contabilidad TO ${rol}`);
        await cliente.query(`GRANT ALL ON public.contabilidad_migraciones TO ${rol}`);
      }

      await cliente.query(sql);

      const { rows } = await cliente.query<{ rol: string; esquema: boolean; tablas: number }>(
        `SELECT r AS rol,
                has_schema_privilege(r, 'contabilidad', 'USAGE') AS esquema,
                (SELECT count(*)::int FROM pg_tables t
                  WHERE (t.schemaname = 'contabilidad'
                         OR (t.schemaname = 'public' AND t.tablename = 'contabilidad_migraciones'))
                    AND has_table_privilege(r, t.schemaname || '.' || t.tablename,
                                            'SELECT, INSERT, UPDATE, DELETE')) AS tablas
           FROM unnest(ARRAY['anon', 'authenticated']) AS r`,
      );
      expect(rows).toEqual([
        { rol: 'anon', esquema: false, tablas: 0 },
        { rol: 'authenticated', esquema: false, tablas: 0 },
      ]);
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });
});
