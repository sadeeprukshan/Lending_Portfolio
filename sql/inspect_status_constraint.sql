-- Run this in Supabase SQL Editor to see the EXACT constraint definition
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition,
  conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname LIKE '%interest_payments_status%'
  OR (conrelid::regclass::text LIKE '%interest_payments%' AND contype = 'c');
