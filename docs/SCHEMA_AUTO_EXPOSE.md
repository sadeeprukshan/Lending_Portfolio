# Schema Auto-Exposure Setup Guide

## Overview

When an admin approves a new company registration in LendingOS, the approval flow now:

1. Creates the company schema + tables via provision_company_schema() RPC
2. Calls the expose-schema Edge Function to automatically add the schema to PostgREST
3. Saves the approval to the registrations table

This eliminates the need to manually edit Exposed schemas in the Supabase Dashboard.

## One-Time Setup Steps

### Step 1: Generate a Supabase Management API Access Token

1. Go to: https://supabase.com/dashboard/account/tokens
2. Click Generate new token
3. Name it: LendingOS Schema Manager
4. Copy the token (starts with sbp_...)
5. Save it somewhere safe you will not see it again

### Step 2: Install Supabase CLI

npm install -g supabase

### Step 3: Login and link project

supabase login
cd lendingos-modular
supabase init
supabase link --project-ref bqzyeoylhpwllymxgfwa

### Step 4: Set Edge Function Secrets

supabase secrets set PROJECT_REF=bqzyeoylhpwllymxgfwa
supabase secrets set MANAGEMENT_API_KEY=sbp_your_token_here

### Step 5: Deploy the Edge Function

supabase functions deploy expose-schema --no-verify-jwt

### Step 6: Test

Approve a new registration in LendingOS. The schema should be auto-exposed.
Check Edge Function logs: supabase functions logs expose-schema

## Security

- Management API token stored as Supabase Secret (server-side only)
- Edge Function runs on Deno (never exposes token to browser)
- Schema names validated against co_[a-z0-9_]+ pattern
- Idempotent (safe to call twice for same schema)
- If Edge Function fails, approval still succeeds with a manual-fix warning
