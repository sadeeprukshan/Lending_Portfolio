-- ============================================================
-- LENDINGOS — SCHEMA PROVISIONING v2 (with auto-expose)
-- Run this ONCE in Supabase SQL Editor.
-- Replaces the previous provision_company_schema function.
-- ============================================================

-- Drop old version
DROP FUNCTION IF EXISTS public.provision_company_schema(text);

-- Create new version that also exposes the schema to PostgREST
CREATE OR REPLACE FUNCTION public.provision_company_schema(p_schema_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_schemas text;
BEGIN
  -- Create the schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

  -- Brokers
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %I.brokers (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name            text NOT NULL UNIQUE,
      phone           text, nic_number text, email text,
      commission_rate numeric(5,2),
      status          text DEFAULT 'Active',
      notes           text,
      created_at      timestamptz DEFAULT now()
    )
  $t$, p_schema_name);

  -- Customers
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %I.customers (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name       text NOT NULL,
      nic_number      text UNIQUE,
      phone           text, address text, occupation text,
      broker_name     text, id_document_url text, notes text,
      created_at      timestamptz DEFAULT now()
    )
  $t$, p_schema_name);

  -- Loans
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %I.loans (
      id                      text PRIMARY KEY,
      creditor_name           text, nic_number text, broker_name text,
      capital                 numeric(14,2),
      rate_pm                 numeric(5,2) DEFAULT 8,
      interest_period         text DEFAULT 'monthly' CHECK (interest_period IN ('monthly', 'annually')),
      month_invested          text, start_date date, pay_date integer,
      status                  text DEFAULT 'Lending',
      has_promissory          boolean DEFAULT false,
      has_mortgage            boolean DEFAULT false,
      promissory_document_url text, id_document_url text,
      mortgage_document_url   text,
      created_at              timestamptz DEFAULT now()
    )
  $t$, p_schema_name);

  -- Interest payments
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %I.interest_payments (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id        text UNIQUE,
      loan_id           text, creditor_name text, broker_name text,
      paid_date         date, period text,
      receivable_amount numeric(14,2), amount numeric(14,2), balance numeric(14,2),
      status            text DEFAULT 'Unpaid',
      notes             text,
      created_at        timestamptz DEFAULT now()
    )
  $t$, p_schema_name);

  -- Loan documents
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %I.loan_documents (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_type text NOT NULL, parent_id text NOT NULL,
      holder      text NOT NULL, file_name text NOT NULL,
      file_url    text NOT NULL, file_ext text,
      uploaded_at timestamptz DEFAULT now()
    )
  $t$, p_schema_name);

  -- Company users (RBAC)
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
  $t$, p_schema_name);

  -- App config
  EXECUTE format($t$
    CREATE TABLE IF NOT EXISTS %I.app_config (
      id           serial PRIMARY KEY,
      config_key   text NOT NULL UNIQUE,
      config_value text, description text,
      updated_at   timestamptz DEFAULT now()
    )
  $t$, p_schema_name);

  -- Grant access to anon + authenticated
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated', p_schema_name);
  EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO anon, authenticated', p_schema_name);
  EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I TO anon, authenticated', p_schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO anon, authenticated', p_schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO anon, authenticated', p_schema_name);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- AUTO-EXPOSE: Add the new schema to PostgREST's extra search path
  -- This is what makes sb.schema('co_xxx').from('loans') work via the API
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Get current extra search path
  BEGIN
    SELECT current_setting('pgrst.db_extra_search_path', true) INTO current_schemas;
  EXCEPTION WHEN OTHERS THEN
    current_schemas := '';
  END;

  -- Add new schema if not already present
  IF current_schemas IS NULL OR current_schemas = '' THEN
    current_schemas := 'public, ' || p_schema_name;
  ELSIF position(p_schema_name IN current_schemas) = 0 THEN
    current_schemas := current_schemas || ', ' || p_schema_name;
  END IF;

  -- Apply the updated search path
  EXECUTE format('ALTER ROLE authenticator SET pgrst.db_extra_search_path TO %L', current_schemas);

  -- Reload PostgREST to pick up the new schema
  NOTIFY pgrst, 'reload config';

END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALSO: Fix any existing schemas that were provisioned but not exposed
-- Run this to expose ALL existing company schemas at once
-- ═══════════════════════════════════════════════════════════════════════════════

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
END;
$$;

NOTIFY pgrst, 'reload config';

SELECT 'Done. All approved company schemas are now exposed to the API.' AS result;
