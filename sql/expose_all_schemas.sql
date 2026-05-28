-- ============================================================
-- EXPOSE ALL APPROVED COMPANY SCHEMAS TO POSTGREST
-- Run this once in Supabase SQL Editor to fix 406 errors
-- for users whose schemas exist but aren't exposed to the API.
-- ============================================================

DO $$
DECLARE
  schemas_list text := 'public';
  r record;
BEGIN
  FOR r IN
    SELECT schema_name FROM public.registrations
    WHERE schema_name IS NOT NULL AND status = 'approved'
  LOOP
    schemas_list := schemas_list || ', ' || r.schema_name;
  END LOOP;

  EXECUTE format('ALTER ROLE authenticator SET pgrst.db_extra_search_path TO %L', schemas_list);
  RAISE NOTICE 'Exposed schemas: %', schemas_list;
END $$;

-- Reload PostgREST to pick up the new schema list
NOTIFY pgrst, 'reload config';

-- Verify what's exposed now
SELECT current_setting('pgrst.db_extra_search_path', true) AS exposed_schemas;
