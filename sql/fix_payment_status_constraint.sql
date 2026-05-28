-- Fix interest_payments.status check constraint to allow 'Paid' and 'Unpaid'
-- Run this in Supabase SQL Editor for your company schema
-- Replace co_yourcompany_xxxx with your actual schema name

-- Option 1: Drop the constraint entirely (most permissive)
DO $$
DECLARE
  schema_name text;
BEGIN
  FOR schema_name IN
    SELECT n.nspname FROM pg_namespace n
    WHERE n.nspname LIKE 'co_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.interest_payments DROP CONSTRAINT IF EXISTS interest_payments_status_check', schema_name);
    RAISE NOTICE 'Dropped constraint on schema: %', schema_name;
  END LOOP;
END $$;

-- Optional: Add back a more permissive constraint
DO $$
DECLARE
  schema_name text;
BEGIN
  FOR schema_name IN
    SELECT n.nspname FROM pg_namespace n
    WHERE n.nspname LIKE 'co_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.interest_payments ADD CONSTRAINT interest_payments_status_check CHECK (status IN (''Paid'', ''Unpaid'', ''Partial''))',
      schema_name
    );
    RAISE NOTICE 'Added new constraint on schema: %', schema_name;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload config';
SELECT 'Done. Status constraint now allows Paid, Unpaid, Partial.' AS result;
