// ── projection.js ──────────────────────────────────────────────────────────
// Projection page — line chart and table showing compound interest growth
// from current month to Jan 2027 (10 months).
//
// Reads window.allLoans, window.RATE, window.GOAL at call time.
// Uses buildProj helper from dashboard.js (exposed via window.buildProj).

import { loanMonthlyIncome, fmt, fmtK } from '/js/helpers.js';

// Module-scoped Chart.js instance (destroyed and recreated on each render)
let projChart = null;

export function renderProjection() {
  const allLoans = window.allLoans || [];
  const RATE = window.RATE || 0.08;
  const GOAL = window.GOAL || 1000000;
  const buildProj = window.buildProj || ((c, m) => [{label:'?',capital:c,interest:m,cumR:0,reinvest:0}]);

  const active = allLoans.filter(l => l.status === 'Lending');
  const deployed = active.reduce((a, l) => a + Number(l.capital), 0);
  const monthly = active.reduce((a, l) => a + loanMonthlyIncome(l), 0);
  const proj = buildProj(deployed, monthly);
  const flat = proj.map(() => Math.round(monthly));

  if (projChart) projChart.destroy();
  projChart = new Chart(document.getElementById('proj-chart'), {
    type: 'line',
    data: {
      labels: proj.map(p => p.label),
      datasets: [
        {label:'With reinvestment', data:proj.map(p=>Math.round(p.interest)), borderColor:'#2E7D32', backgroundColor:'rgba(46,125,50,0.07)', fill:true, tension:0.35, pointRadius:4, pointBackgroundColor:'#2E7D32'},
        {label:'No reinvestment', data:flat, borderColor:'#616161', fill:false, tension:0, pointRadius:3, borderDash:[3,3]},
        {label:'1M goal', data:proj.map(()=>GOAL), borderColor:'#f87171', borderDash:[5,4], pointRadius:0, borderWidth:1.5, fill:false},
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>'LKR '+Math.round(c.raw).toLocaleString()}}},
      scales:{
        y:{ticks:{callback:v=>'LKR '+Math.round(v/1000)+'K', color:'#7a8a7a', font:{size:9}}, grid:{color:'rgba(255,255,255,.04)'}, border:{display:false}},
        x:{ticks:{color:'#7a8a7a', font:{size:10}}, grid:{display:false}}
      }
    }
  });

  document.getElementById('proj-tbody').innerHTML = proj.map(p => {
    const pct = Math.min(100, p.interest/GOAL*100), hit = p.interest >= GOAL;
    return `<tr style="${hit?'background:rgba(163,230,53,0.05)':''}"><td class="mono" style="font-weight:600">${p.label}</td><td class="mono">LKR ${fmtK(p.capital)}</td><td class="mono" style="color:${hit?'var(--accent)':'var(--text)'}${hit?';font-weight:700':''}">LKR ${fmt(p.interest)}${hit?' ✓':''}</td><td class="mono" style="color:var(--accent)">+ LKR ${fmt(p.reinvest)}</td><td class="mono" style="color:var(--muted)">LKR ${fmtK(p.cumR)}</td><td><div style="display:flex;align-items:center;gap:5px"><div style="background:var(--border);border-radius:3px;height:5px;width:50px;overflow:hidden"><div style="height:100%;border-radius:3px;background:${hit?'var(--accent)':'var(--amber)'};width:${pct.toFixed(0)}%"></div></div><span class="mono" style="font-size:10px;color:var(--muted)">${pct.toFixed(0)}%</span></div></td><td class="mono" style="color:${hit?'var(--accent)':'var(--muted)'}">${hit?'Goal reached':'LKR '+fmtK(Math.max(0,GOAL-p.interest))}</td></tr>`;
  }).join('');
}

// Expose to window
Object.assign(window, { renderProjection });
