-- ============================================================
-- ADD COMPANY_USERS TABLE TO EACH TENANT SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add company_users table to ALL existing tenant schemas
DO $$
DECLARE
  schema_name text;
BEGIN
  FOR schema_name IN
    SELECT s.schema_name FROM public.registrations r
    JOIN information_schema.schemata s ON s.schema_name = r.schema_name
    WHERE r.schema_name IS NOT NULL AND r.status = 'approved'
  LOOP
    -- Create company_users table
    EXECUTE format($t$
      CREATE TABLE IF NOT EXISTS %I.company_users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid,
        email         text NOT NULL,
        full_name     text,
        role          text NOT NULL DEFAULT 'viewer'
                      CHECK (role IN ('owner', 'admin', 'manager', 'viewer')),
        status        text NOT NULL DEFAULT 'invited'
                      CHECK (status IN ('invited', 'active', 'suspended')),
        permissions   jsonb NOT NULL DEFAULT '{}'::jsonb,
        invited_by    text,
        created_at    timestamptz DEFAULT now(),
        updated_at    timestamptz DEFAULT now(),
        UNIQUE(email)
      )
    $t$, schema_name);

    -- Grant access
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO anon, authenticated', schema_name);

    RAISE NOTICE 'Added company_users to schema: %', schema_name;
  END LOOP;
END $$;

-- 2. Update provision_company_schema function to include company_users for NEW schemas
-- (Add this table creation inside your existing provision function)
-- The table is also created automatically when this SQL runs for existing schemas.

NOTIFY pgrst, 'reload config';
SELECT 'Done. company_users table added to all approved company schemas.' AS result;
