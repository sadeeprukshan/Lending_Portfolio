// ── expose-schema Edge Function ────────────────────────────────────────────
// Called by LendingOS admin after approving a new company registration.
// Adds the new company schema to PostgREST's exposed schemas list
// via the Supabase Management API.
//
// Requires two secrets set via Supabase CLI:
//   SUPABASE_PROJECT_REF    — your project ref (e.g. bqzyeoylhpwllymxgfwa)
//   SUPABASE_MANAGEMENT_KEY — personal access token from supabase.com/dashboard/account/tokens
//
// Usage from client:
//   POST /functions/v1/expose-schema
//   Headers: { Authorization: Bearer <anon_key_or_user_jwt> }
//   Body:    { "schema_name": "co_acme_abc123" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Validate request ──────────────────────────────────────────────────
    const { schema_name } = await req.json();
    if (!schema_name || typeof schema_name !== "string") {
      return new Response(
        JSON.stringify({ error: "schema_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Basic validation — schema name must match our pattern
    if (!/^co_[a-z0-9_]+$/.test(schema_name)) {
      return new Response(
        JSON.stringify({ error: "Invalid schema name format. Must match: co_<name>_<id>" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Read secrets ──────────────────────────────────────────────────────
    const PROJECT_REF = Deno.env.get("PROJECT_REF");
    const MGMT_KEY = Deno.env.get("MANAGEMENT_API_KEY");

    if (!PROJECT_REF || !MGMT_KEY) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured — missing PROJECT_REF or MANAGEMENT_API_KEY secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}/postgrest`;

    // ── Step 1: GET current PostgREST config ──────────────────────────────
    const getRes = await fetch(API_BASE, {
      headers: { Authorization: `Bearer ${MGMT_KEY}` },
    });

    if (!getRes.ok) {
      const errText = await getRes.text();
      return new Response(
        JSON.stringify({ error: `Failed to read PostgREST config: ${getRes.status} — ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = await getRes.json();
    const currentSchemas = config.db_schema || "public";

    // ── Step 2: Check if schema is already exposed ────────────────────────
    const schemaList = currentSchemas.split(",").map((s: string) => s.trim());
    if (schemaList.includes(schema_name)) {
      return new Response(
        JSON.stringify({ success: true, message: "Schema already exposed", db_schema: currentSchemas }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 3: Append new schema and PATCH ────────────────────────────────
    const newSchemas = currentSchemas + ", " + schema_name;

    const patchRes = await fetch(API_BASE, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${MGMT_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ db_schema: newSchemas }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      return new Response(
        JSON.stringify({ error: `Failed to update PostgREST config: ${patchRes.status} — ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await patchRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Schema "${schema_name}" exposed successfully`,
        db_schema: result.db_schema || newSchemas,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
