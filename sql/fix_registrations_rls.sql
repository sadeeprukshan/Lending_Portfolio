-- Fix RLS on registrations table
-- Allow anon users to INSERT (for registration form)
ALTER TABLE public.registrations DISABLE ROW LEVEL SECURITY;
