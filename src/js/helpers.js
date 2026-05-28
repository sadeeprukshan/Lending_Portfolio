// ── helpers.js ─────────────────────────────────────────────────────────────
// Pure utility functions — no dependencies, no DOM state, no Supabase.
// Used across every page for formatting, badges, and messages.

/** Format number with LK locale comma separators: 1234567 → "1,234,567" */
export function fmt(n) {
  return Math.round(n).toLocaleString('en-LK');
}

/** Compact format: 1500000 → "1.50M", 45000 → "45K", 800 → "800" */
export function fmtK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return Math.round(n).toString();
}

/** Months active since a start date */
export function moActive(d) {
  const TODAY = new Date();
  return Math.max(0, (TODAY - new Date(d)) / (1000 * 60 * 60 * 24 * 30.44));
}

/** Calculate monthly income for a loan given its rate and period
 *  loan.rate_pm is the percentage (e.g. 8 for 8%)
 *  loan.interest_period is 'monthly' or 'annually'
 *  Falls back to 8% monthly if missing.
 */
export function loanMonthlyIncome(loan) {
  const capital = parseFloat(loan.capital) || 0;
  const rate = parseFloat(loan.rate_pm) || 8;
  const period = loan.interest_period || 'monthly';
  if (period === 'annually') return capital * rate / 100 / 12;
  return capital * rate / 100;
}

/** Status badge HTML: Lending → green, Settled → muted, Overdue → red */
export function sBadge(s) {
  const m = { Lending: 'bg', Settled: 'bd', Overdue: 'br', Pending: 'ba' };
  return `<span class="badge ${m[s] || 'bd'}">${s}</span>`;
}

/** Document presence badge: green if present, red if missing */
export function dBadge(l, ok) {
  return `<span class="badge ${ok ? 'bg' : 'br'}" title="${l}: ${ok ? 'Present' : 'Missing'}" style="font-size:9px;margin-right:2px">${l[0]}</span>`;
}

/** Show a form message (success or error) in an element by ID */
export function showMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = msg;
    el.className = 'fmsg ' + (type === 'ok' ? 'ok' : 'err');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
