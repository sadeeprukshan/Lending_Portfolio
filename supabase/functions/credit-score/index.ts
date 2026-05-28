// ── credit-score Edge Function ─────────────────────────────────────────────
// Queries ALL company schemas for a customer's repayment history by NIC number.
// Returns: customer info, all loans, all payments, calculated scores.
//
// Requires secret: SERVICE_ROLE_KEY
//
// Usage:
//   POST /functions/v1/credit-score
//   Body: { "nic_number": "123456789V" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Score calculation based on days late
function calcScore(paidDate: string, dueDate: string): { score: number; grade: string; color: string; label: string } {
  if (!paidDate || !dueDate) return { score: 0, grade: 'X', color: '#000000', label: 'No data' };
  
  const paid = new Date(paidDate);
  const due = new Date(dueDate);
  const daysLate = Math.floor((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysLate <= 7)  return { score: 5, grade: 'A', color: '#2E7D32', label: 'Early / On time' };
  if (daysLate <= 14) return { score: 4, grade: 'B', color: '#1565C0', label: '7-14 days late' };
  if (daysLate <= 21) return { score: 3, grade: 'C', color: '#F9A825', label: '14-21 days late' };
  if (daysLate <= 28) return { score: 2, grade: 'D', color: '#7B1FA2', label: '21-28 days late' };
  if (daysLate <= 35) return { score: 1, grade: 'E', color: '#C62828', label: '28-35 days late' };
  return { score: 0, grade: 'F', color: '#000000', label: 'Over 35 days late' };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { nic_number } = await req.json();

    if (!nic_number || typeof nic_number !== "string" || nic_number.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Valid NIC number is required (minimum 5 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1: Get all approved company schemas
    const { data: regs } = await supabase
      .from("registrations")
      .select("company_name, schema_name")
      .eq("status", "approved")
      .not("schema_name", "is", null);

    if (!regs || !regs.length) {
      return new Response(
        JSON.stringify({ error: "No registered companies found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nicClean = nic_number.trim().toUpperCase();
    
    // Step 2: Search each schema for the customer
    let customerInfo: any = null;
    const allLoans: any[] = [];
    const allPayments: any[] = [];

    for (const reg of regs) {
      try {
        const schemaClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
          db: { schema: reg.schema_name },
        });

        // Find customer by NIC
        const { data: customers } = await schemaClient
          .from("customers")
          .select("*")
          .eq("nic_number", nicClean);

        if (customers && customers.length > 0) {
          if (!customerInfo) {
            customerInfo = {
              full_name: customers[0].full_name,
              nic_number: customers[0].nic_number,
              phone: customers[0].phone,
              address: customers[0].address,
            };
          }
        }

        // Find loans by NIC — search with exact match + without/with trailing V
        const nicVariants = [nicClean];
        if (nicClean.endsWith('V')) nicVariants.push(nicClean.slice(0, -1));
        else nicVariants.push(nicClean + 'V');
        
        const { data: loans } = await schemaClient
          .from("loans")
          .select("*")
          .in("nic_number", nicVariants);

        if (loans && loans.length > 0) {
          for (const loan of loans) {
            allLoans.push({
              ...loan,
              company_name: reg.company_name,
              schema_name: reg.schema_name,
            });

            // Get payments for this loan
            const { data: payments } = await schemaClient
              .from("interest_payments")
              .select("*")
              .eq("loan_id", loan.id)
              .order("paid_date", { ascending: true });

            if (payments) {
              for (const p of payments) {
                // Calculate the due date: loan start_date + pay_date (day of month)
                // Each payment period corresponds to a monthly cycle
                const loanStart = new Date(loan.start_date);
                const payDay = parseInt(loan.pay_date) || 30;
                
                // Parse period to figure out due date
                let dueDate = '';
                if (p.period) {
                  // Period format: "Apr 2026" or "2026-04"
                  const periodParts = p.period.split(' ');
                  if (periodParts.length === 2) {
                    const monthNames: Record<string, number> = {
                      'Jan':0,'Feb':1,'Mar':2,'Apr':3,'May':4,'Jun':5,
                      'Jul':6,'Aug':7,'Sep':8,'Oct':9,'Nov':10,'Dec':11
                    };
                    const monthIdx = monthNames[periodParts[0]];
                    const year = parseInt(periodParts[1]);
                    if (monthIdx !== undefined && year) {
                      const due = new Date(year, monthIdx, payDay);
                      dueDate = due.toISOString().split('T')[0];
                    }
                  }
                }

                const scoreResult = calcScore(p.paid_date, dueDate);

                allPayments.push({
                  ...p,
                  company_name: reg.company_name,
                  due_date: dueDate,
                  days_late: dueDate && p.paid_date
                    ? Math.floor((new Date(p.paid_date).getTime() - new Date(dueDate).getTime()) / (1000*60*60*24))
                    : null,
                  ...scoreResult,
                });
              }
            }
          }
        }
      } catch (schemaErr) {
        // Skip schemas that don't have the required tables
        continue;
      }
    }

    if (!customerInfo && allLoans.length === 0) {
      return new Response(
        JSON.stringify({ 
          found: false, 
          message: `No records found for NIC: ${nicClean}`,
          nic_number: nicClean,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Calculate summary
    const activeLoans = allLoans.filter(l => l.status === 'Lending');
    const settledLoans = allLoans.filter(l => l.status === 'Settled');
    const overdueLoans = allLoans.filter(l => l.status === 'Overdue');
    const totalCapital = allLoans.reduce((sum, l) => sum + (parseFloat(l.capital) || 0), 0);
    const activeCapital = activeLoans.reduce((sum, l) => sum + (parseFloat(l.capital) || 0), 0);

    const scoredPayments = allPayments.filter(p => p.score !== undefined);
    const avgScore = scoredPayments.length > 0
      ? scoredPayments.reduce((sum, p) => sum + p.score, 0) / scoredPayments.length
      : 0;

    // Score distribution
    const scoreDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
    scoredPayments.forEach(p => { scoreDist[p.score as keyof typeof scoreDist]++; });

    // Overall grade
    let overallGrade = 'F';
    let overallColor = '#000000';
    let overallLabel = 'No data';
    if (avgScore >= 4.5) { overallGrade = 'A'; overallColor = '#2E7D32'; overallLabel = 'Excellent'; }
    else if (avgScore >= 3.5) { overallGrade = 'B'; overallColor = '#1565C0'; overallLabel = 'Good'; }
    else if (avgScore >= 2.5) { overallGrade = 'C'; overallColor = '#F9A825'; overallLabel = 'Average'; }
    else if (avgScore >= 1.5) { overallGrade = 'D'; overallColor = '#7B1FA2'; overallLabel = 'Poor'; }
    else if (avgScore >= 0.5) { overallGrade = 'E'; overallColor = '#C62828'; overallLabel = 'Very Poor'; }
    else if (scoredPayments.length > 0) { overallGrade = 'F'; overallColor = '#000000'; overallLabel = 'Critical'; }

    return new Response(
      JSON.stringify({
        found: true,
        customer: customerInfo || { nic_number: nicClean, full_name: 'Unknown' },
        summary: {
          total_loans: allLoans.length,
          active_loans: activeLoans.length,
          settled_loans: settledLoans.length,
          overdue_loans: overdueLoans.length,
          total_capital: totalCapital,
          active_capital: activeCapital,
          total_payments: scoredPayments.length,
          avg_score: Math.round(avgScore * 100) / 100,
          overall_grade: overallGrade,
          overall_color: overallColor,
          overall_label: overallLabel,
          score_distribution: scoreDist,
        },
        loans: allLoans.map(l => ({
          id: l.id,
          creditor_name: l.creditor_name,
          capital: l.capital,
          status: l.status,
          start_date: l.start_date,
          broker_name: l.broker_name,
          company_name: l.company_name,
        })),
        payments: allPayments,
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
