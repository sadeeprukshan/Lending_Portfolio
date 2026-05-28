import { loanMonthlyIncome } from '/js/helpers.js';
// ── dashboard.js ───────────────────────────────────────────────────────────
// Dashboard KPIs, broker chart, status chart, goal progress.
// Reads allLoans from window.allLoans (set by loadAll in index.html).
// Uses fmt, fmtK, moActive from window.* (exposed by helpers.js).
// Uses RATE, GOAL from window.* (exposed by config.js import in index.html).

let brokerChart  = null;
let statusChart  = null;

export function renderDashboard() {
  const allLoans = window.allLoans || [];
  const RATE = window.RATE || 0.08;
  const GOAL = window.GOAL || 1000000;
  const fmt  = window.fmt  || (n => Math.round(n).toLocaleString());
  const fmtK = window.fmtK || (n => String(n));
  const moActive = window.moActive || (() => 0);
  const sBadge   = window.sBadge   || (s => s);
  const dBadge   = window.dBadge   || (() => '');

  const active  = allLoans.filter(l => l.status === 'Lending');
  const deployed = active.reduce((a, l) => a + Number(l.capital), 0);
  const monthly  = active.reduce((a, l) => a + loanMonthlyIncome(l), 0);
  const totalEarned = allLoans.reduce((a, l) => a + loanMonthlyIncome(l) * moActive(l.start_date), 0);
  const needed = Math.max(0, GOAL - monthly) / RATE;
  const pct = Math.min(100, monthly / GOAL * 100);

  const el = id => document.getElementById(id);

  el('dash-loan-count').textContent = active.length + ' active';

  // Alerts
  const missMort = active.filter(l => Number(l.capital) >= 300000 && !l.has_mortgage);
  const missProm = active.filter(l => !l.has_promissory);
  let alerts = '';
  if (missMort.length) alerts += `<div class="alert">${missMort.length} loan${missMort.length > 1 ? 's' : ''} ≥300K missing mortgage: ${missMort.map(l => l.creditor_name.split(' ')[0]).join(', ')}</div>`;
  if (missProm.length) alerts += `<div class="alert alert-amber">${missProm.length} loan${missProm.length > 1 ? 's' : ''} missing promissory note</div>`;
  el('alerts-panel').innerHTML = alerts;

  // KPIs
  el('kpi-grid').innerHTML = [
    { l: 'Capital deployed', v: 'LKR ' + fmtK(deployed), s: active.length + ' active loans', hi: false },
    { l: 'Monthly interest', v: 'LKR ' + fmt(monthly), s: '8% on deployed capital', hi: true },
    { l: 'Total earned', v: 'LKR ' + fmtK(totalEarned), s: 'Since Mar 2025', hi: false },
    { l: 'Capital gap', v: 'LKR ' + fmtK(needed), s: 'To reach 1M/month', hi: false },
  ].map(m => `<div class="metric-card ${m.hi ? 'hi' : ''}"><div class="m-label">${m.l}</div><div class="m-val">${m.v}</div><div class="m-sub">${m.s}</div></div>`).join('');

  // Goal progress
  const proj = buildProj(deployed, monthly, RATE, GOAL);
  const hitIdx = proj.findIndex(p => p.interest >= GOAL);
  const jan = proj[proj.length - 1];
  const insight = hitIdx >= 0
    ? `↗ With full reinvestment, you cross 1M/month in ${hitIdx + 1} month${hitIdx === 0 ? '' : 's'} (~${proj[hitIdx].label}).`
    : `At full reinvestment → LKR ${fmt(jan.interest)}/month by Jan 2027 (${((jan.interest / GOAL) * 100).toFixed(0)}%). Need LKR ${fmtK(needed)} more deployed.`;

  el('goal-card').innerHTML = `
    <div class="goal-header"><div class="goal-title">Goal — LKR 1,000,000/month by Jan 2027</div>
    <span class="badge ${pct >= 100 ? 'bg' : pct >= 50 ? 'ba' : 'bb'}">${pct.toFixed(1)}%</span></div>
    <div class="prog-outer"><div class="prog-inner" id="prog-fill" style="width:0%"></div></div>
    <div class="goal-labels"><span>LKR ${fmt(monthly)}/month</span><span>LKR 1,000,000 target</span></div>
    <div class="goal-insight">${insight}</div>`;
  setTimeout(() => { const f = el('prog-fill'); if (f) f.style.width = pct.toFixed(1) + '%'; }, 100);

  renderBrokerChart(active);
  renderStatusChart();

  // Recent loans mini-table
  const recentEl = el('recent-table');
  if (recentEl) recentEl.innerHTML = window.buildLoansTable?.(allLoans.slice(0, 6)) || '';
}

export function renderBrokerChart(active) {
  const fmt = window.fmt || (n => Math.round(n).toLocaleString());
  const bm = {};
  active.forEach(l => { bm[l.broker_name] = (bm[l.broker_name] || 0) + Number(l.capital); });
  const labels = Object.keys(bm), data = Object.values(bm);
  if (brokerChart) brokerChart.destroy();
  brokerChart = new Chart(document.getElementById('broker-chart'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: ['#FFC107', '#0D47A1', '#2E7D32', '#1A237E'], borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'LKR ' + Math.round(c.raw).toLocaleString() } } },
      scales: {
        y: { ticks: { callback: v => 'LKR ' + Math.round(v / 1000) + 'K', color: '#7a8a7a', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.04)' }, border: { display: false } },
        x: { ticks: { color: '#7a8a7a', font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

export function renderStatusChart() {
  const allLoans = window.allLoans || [];
  const c = { Lending: 0, Settled: 0, Overdue: 0, Pending: 0 };
  allLoans.forEach(l => { c[l.status] = (c[l.status] || 0) + 1; });
  const labels = Object.keys(c).filter(k => c[k] > 0), data = labels.map(k => c[k]);
  const cols = { Lending: '#2E7D32', Settled: '#FFC107', Overdue: '#f87171', Pending: '#0D47A1' };
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('status-chart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map(k => cols[k]), borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { position: 'right', labels: { color: '#7a8a7a', font: { size: 10 }, padding: 8, boxWidth: 10 } } }
    }
  });
}

// ── Projection helper (used by dashboard + projection page) ─────────────
export function buildProj(cap, monthly, rate, goal) {
  rate = rate || 0.08;
  goal = goal || 1000000;
  const labels = ['Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26', 'Nov 26', 'Dec 26', 'Jan 27'];
  let c = cap, i = monthly, cumR = 0;
  return labels.map(label => { const r = i; cumR += r; c += r; i = c * rate; return { label, capital: c, interest: i, cumR, reinvest: r }; });
}

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, { renderDashboard, renderBrokerChart, renderStatusChart, buildProj });
