// ── scoring.js ────────────────────────────────────────────────────────────
// Customer Repayment Scoring Board — cross-company credit score lookup.
// Search by NIC number to see repayment history and scores across ALL companies.
// Accessible by: Owner, Admin, Manager. NOT accessible by Viewer.

import { fmt, fmtK, showMsg } from '/js/helpers.js';

let lastResult = null;
let scoreChart = null;

// ── Score color/label mapping ─────────────────────────────────────────────
const SCORE_COLORS = {
  5: { bg: '#2E7D32', label: 'A - Early/On time',   text: '#fff' },
  4: { bg: '#1565C0', label: 'B - 7-14 days',       text: '#fff' },
  3: { bg: '#F9A825', label: 'C - 14-21 days',      text: '#000' },
  2: { bg: '#7B1FA2', label: 'D - 21-28 days',      text: '#fff' },
  1: { bg: '#C62828', label: 'E - 28-35 days',      text: '#fff' },
  0: { bg: '#000000', label: 'F - Over 35 days',    text: '#fff' },
};

// ── Search customer by NIC ────────────────────────────────────────────────
async function searchCreditScore() {
  const nicInput = document.getElementById('cs-nic');
  const nic = nicInput?.value?.trim();

  if (!nic || nic.length < 5) {
    showMsg('cs-msg', 'Enter a valid NIC number (minimum 5 characters).', 'err');
    return;
  }

  showMsg('cs-msg', 'Searching across all companies…', 'ok');
  document.getElementById('cs-results').style.display = 'none';
  document.getElementById('cs-not-found').style.display = 'none';

  try {
    // Call the server-side search_credit_score function (searches ALL schemas)
    const { data: rpcResult, error: rpcErr } = await window.sb.rpc('search_credit_score', { p_nic: nic });

    if (rpcErr) {
      showMsg('cs-msg', 'Error: ' + (rpcErr.message || 'Search failed'), 'err');
      return;
    }

    const data = rpcResult || { found: false };

    if (!data.found) {
      showMsg('cs-msg', '', '');
      document.getElementById('cs-not-found').style.display = 'block';
      document.getElementById('cs-not-found-nic').textContent = nic;
      return;
    }

    // The RPC returns raw data — we need to calculate scores client-side
    const payments = (data.payments || []).map(p => {
      const payDay = parseInt(p.pay_date) || 30;
      let dueDate = '';
      if (p.period) {
        const monthNames = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
        const parts = p.period.split(' ');
        if (parts.length === 2) {
          const mIdx = monthNames[parts[0]];
          const yr = parseInt(parts[1]);
          if (mIdx !== undefined && yr) {
            const yr4 = yr < 100 ? 2000 + yr : yr;
            dueDate = new Date(yr4, mIdx, payDay).toISOString().split('T')[0];
          }
        }
      }
      let daysLate = null, score = 0, grade = 'F', color = '#000000', label = 'No data';
      if (p.paid_date && dueDate) {
        daysLate = Math.floor((new Date(p.paid_date) - new Date(dueDate)) / (1000*60*60*24));
        if (daysLate <= 7)       { score=5; grade='A'; color='#2E7D32'; label='Early / On time'; }
        else if (daysLate <= 14) { score=4; grade='B'; color='#1565C0'; label='7-14 days late'; }
        else if (daysLate <= 21) { score=3; grade='C'; color='#F9A825'; label='14-21 days late'; }
        else if (daysLate <= 28) { score=2; grade='D'; color='#7B1FA2'; label='21-28 days late'; }
        else if (daysLate <= 35) { score=1; grade='E'; color='#C62828'; label='28-35 days late'; }
        else                     { score=0; grade='F'; color='#000000'; label='Over 35 days late'; }
      }
      return { ...p, due_date: dueDate, days_late: daysLate, score, grade, color, label };
    });

    // Calculate summary
    const loans = data.loans || [];
    const activeLoans = loans.filter(l => l.status === 'Lending');
    const settledLoans = loans.filter(l => l.status === 'Settled');
    const overdueLoans = loans.filter(l => l.status === 'Overdue');
    const totalCapital = loans.reduce((s, l) => s + (parseFloat(l.capital) || 0), 0);
    const activeCapital = activeLoans.reduce((s, l) => s + (parseFloat(l.capital) || 0), 0);
    const scoredPayments = payments.filter(p => p.score !== undefined);
    const avgScore = scoredPayments.length ? scoredPayments.reduce((s, p) => s + p.score, 0) / scoredPayments.length : 0;
    const scoreDist = { 5:0, 4:0, 3:0, 2:0, 1:0, 0:0 };
    scoredPayments.forEach(p => { scoreDist[p.score]++; });

    let overallGrade='F', overallColor='#000000', overallLabel='No data';
    if (avgScore >= 4.5)      { overallGrade='A'; overallColor='#2E7D32'; overallLabel='Excellent'; }
    else if (avgScore >= 3.5) { overallGrade='B'; overallColor='#1565C0'; overallLabel='Good'; }
    else if (avgScore >= 2.5) { overallGrade='C'; overallColor='#F9A825'; overallLabel='Average'; }
    else if (avgScore >= 1.5) { overallGrade='D'; overallColor='#7B1FA2'; overallLabel='Poor'; }
    else if (avgScore >= 0.5) { overallGrade='E'; overallColor='#C62828'; overallLabel='Very Poor'; }
    else if (scoredPayments.length > 0) { overallGrade='F'; overallColor='#000000'; overallLabel='Critical'; }

    const fullData = {
      found: true,
      customer: data.customer,
      summary: {
        total_loans: loans.length, active_loans: activeLoans.length,
        settled_loans: settledLoans.length, overdue_loans: overdueLoans.length,
        total_capital: totalCapital, active_capital: activeCapital,
        total_payments: scoredPayments.length, avg_score: Math.round(avgScore * 100) / 100,
        overall_grade: overallGrade, overall_color: overallColor, overall_label: overallLabel,
        score_distribution: scoreDist,
      },
      loans, payments,
    };

    lastResult = fullData;
    showMsg('cs-msg', '', '');
    renderScoreBoard(fullData);

  } catch (e) {
    showMsg('cs-msg', 'Error: ' + (e.message || 'Search failed'), 'err');
  }
}

// ── Render the full score board ───────────────────────────────────────────
function renderScoreBoard(data) {
  const results = document.getElementById('cs-results');
  results.style.display = 'block';

  const { customer, summary, loans, payments } = data;

  // Customer info
  document.getElementById('cs-name').textContent = customer.full_name || 'Unknown';
  document.getElementById('cs-nic-display').textContent = customer.nic_number || '';
  document.getElementById('cs-phone').textContent = customer.phone || '—';

  // Overall score badge
  const scoreBadge = document.getElementById('cs-overall-score');
  scoreBadge.textContent = summary.avg_score.toFixed(1) + ' / 5.0';
  scoreBadge.style.background = summary.overall_color;
  scoreBadge.style.color = '#fff';

  const gradeBadge = document.getElementById('cs-overall-grade');
  gradeBadge.textContent = summary.overall_grade + ' — ' + summary.overall_label;
  gradeBadge.style.color = summary.overall_color;

  // Loan summary cards
  document.getElementById('cs-total-loans').textContent = summary.total_loans;
  document.getElementById('cs-active-loans').textContent = summary.active_loans;
  document.getElementById('cs-settled-loans').textContent = summary.settled_loans;
  document.getElementById('cs-overdue-loans').textContent = summary.overdue_loans;
  document.getElementById('cs-total-capital').textContent = 'LKR ' + fmtK(summary.total_capital);
  document.getElementById('cs-active-capital').textContent = 'LKR ' + fmtK(summary.active_capital);
  document.getElementById('cs-total-payments').textContent = summary.total_payments;

  // Score distribution chart
  renderScoreChart(summary.score_distribution);

  // Payment history table
  renderPaymentHistory(payments);

  // Loan list
  renderLoanList(loans);

  results.scrollIntoView({ behavior: 'smooth' });
}

// ── Score distribution chart ──────────────────────────────────────────────
function renderScoreChart(dist) {
  const ctx = document.getElementById('cs-chart');
  if (!ctx) return;

  if (scoreChart) scoreChart.destroy();

  const labels = ['A (5)', 'B (4)', 'C (3)', 'D (2)', 'E (1)', 'F (0)'];
  const values = [dist[5]||0, dist[4]||0, dist[3]||0, dist[2]||0, dist[1]||0, dist[0]||0];
  const colors = ['#2E7D32', '#1565C0', '#F9A825', '#7B1FA2', '#C62828', '#000000'];

  scoreChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: c => c.raw + ' payment' + (c.raw !== 1 ? 's' : '') }
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#7a8a7a', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,.04)' },
          border: { display: false },
        },
        x: {
          ticks: { color: '#7a8a7a', font: { size: 10 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ── Payment history table with color-coded rows ───────────────────────────
function renderPaymentHistory(payments) {
  const tbody = document.getElementById('cs-payment-tbody');
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">No payment history found.</td></tr>';
    return;
  }

  tbody.innerHTML = payments.map(p => {
    const sc = SCORE_COLORS[p.score] || SCORE_COLORS[0];
    return `<tr style="border-left:4px solid ${sc.bg}">
      <td class="mono" style="font-size:10px">${p.period || '—'}</td>
      <td class="mono">${p.paid_date || '—'}</td>
      <td class="mono">${p.due_date || '—'}</td>
      <td class="mono">${p.days_late !== null ? (p.days_late <= 0 ? 'On time' : p.days_late + 'd late') : '—'}</td>
      <td class="mono">LKR ${fmt(p.amount || 0)}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${sc.bg};color:${sc.text}">${p.score}/5</span></td>
      <td style="font-size:10px;color:var(--muted)">${sc.label}</td>
      <td style="font-size:10px;color:var(--muted)">${p.company_name || '—'}</td>
    </tr>`;
  }).join('');
}

// ── Loan list ─────────────────────────────────────────────────────────────
function renderLoanList(loans) {
  const tbody = document.getElementById('cs-loan-tbody');
  if (!tbody) return;

  if (!loans.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No loans found.</td></tr>';
    return;
  }

  const statusColor = { Lending: 'var(--accent)', Settled: 'var(--muted)', Overdue: '#C62828' };

  tbody.innerHTML = loans.map(l => `<tr>
    <td style="font-weight:600">${l.creditor_name || '—'}</td>
    <td class="mono">LKR ${fmtK(l.capital || 0)}</td>
    <td><span style="color:${statusColor[l.status] || 'var(--muted)'};font-weight:600">${l.status}</span></td>
    <td class="mono" style="font-size:11px">${l.start_date || '—'}</td>
    <td style="font-size:11px">${l.broker_name || '—'}</td>
    <td style="font-size:10px;color:var(--muted)">${l.company_name || '—'}</td>
  </tr>`).join('');
}

// ── Clear search ──────────────────────────────────────────────────────────
function clearCreditSearch() {
  document.getElementById('cs-nic').value = '';
  document.getElementById('cs-results').style.display = 'none';
  document.getElementById('cs-not-found').style.display = 'none';
  showMsg('cs-msg', '', '');
  lastResult = null;
}

// ── Print / Save as PDF ───────────────────────────────────────────────────
function printCreditScore() {
  if (!lastResult || !lastResult.found) {
    alert('Please search for a customer first.');
    return;
  }
  // Trigger browser print dialog — user can choose Save as PDF
  window.print();
}

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  searchCreditScore, clearCreditSearch, printCreditScore,
  renderScoreBoard, renderScoreChart, renderPaymentHistory, renderLoanList,
});
