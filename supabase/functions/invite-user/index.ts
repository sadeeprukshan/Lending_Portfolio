// ── invite-user Edge Function ──────────────────────────────────────────────
// Called by LendingOS when a company owner adds a new user.
// Sends an invitation email via Supabase Auth using the service_role key.
//
// Requires secret set via Supabase CLI:
//   SERVICE_ROLE_KEY — your project's service_role key (from Dashboard > Settings > API)
//
// Usage from client:
//   POST /functions/v1/invite-user
//   Headers: { Authorization: Bearer <user_jwt>, Content-Type: application/json }
//   Body:    { "email": "user@example.com", "company_name": "Acme Corp", "role": "manager" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { email, company_name, role } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read secrets
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured — missing SUPABASE_URL or SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin Supabase client with service_role key
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Invite user via Supabase Auth
    // This sends a magic link email — user clicks it to set their password
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        company_name: company_name || "LendingOS",
        role: role || "viewer",
        invited: true,
      },
      redirectTo: Deno.env.get("APP_URL") || "https://serendibintellectual.com",
    });

    if (error) {
      // If user already exists, that's ok — they can still log in
      if (error.message?.includes("already been registered")) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "User already has an account. They can log in with their existing credentials.",
            already_exists: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitation email sent to ${email}`,
        user_id: data?.user?.id || null,
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
