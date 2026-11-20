-- GUIA_EQUIPO_6, sección 4: RLS habilitado en las tablas del módulo (Supabase).
--
-- El esquema "contabilidad" NO se expone por la API de datos de Supabase (PostgREST): solo el
-- backend lo usa, conectado con el rol dueño de las tablas, que no queda limitado por RLS
-- porque no se usa FORCE ROW LEVEL SECURITY. Habilitar RLS sin políticas y retirar los permisos
-- de anon/authenticated garantiza que, aunque alguien expusiera el esquema, ninguna petición
-- con la publishable/anon key ni con el token de un usuario pueda leer o escribir estas tablas.
-- Toda la autorización (rol y alcance del vendedor) la aplica el backend antes de cada consulta.
--
-- Solo afecta al esquema contabilidad y a la tabla de control de migraciones del módulo.

-- 1. RLS en todas las tablas del esquema (las migraciones futuras deben hacer lo mismo; la
--    prueba de integración fundaciones.test.ts falla si alguna tabla queda sin RLS).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'contabilidad' LOOP
    EXECUTE format('ALTER TABLE contabilidad.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- La tabla de control vive en public, que Supabase sí expone: también se protege.
ALTER TABLE public.contabilidad_migraciones ENABLE ROW LEVEL SECURITY;

-- 2. Sin acceso para los roles de la API de datos de Supabase. En PostgreSQL local o en la CI
--    estos roles no existen y el bloque no hace nada.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA contabilidad FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA contabilidad FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA contabilidad FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA contabilidad FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE public.contabilidad_migraciones FROM %I', r);
      -- Objetos que creen las próximas migraciones (con el mismo rol que ejecuta esta).
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA contabilidad REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA contabilidad REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA contabilidad REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
