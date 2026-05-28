// ── payments.js ────────────────────────────────────────────────────────────
// Interest payments page, repayment overview, payment detail.
// Reads shared state from window.* (set by loadAll / state.js).
// Uses helpers (fmt, fmtK, sBadge, showMsg) from window.*.

import { dbFrom } from '/js/db.js';
import { loanMonthlyIncome, fmt, fmtK, moActive, sBadge, dBadge, showMsg } from '/js/helpers.js';

let currentPaymentId = null;  // module-scoped state ID, mirrored to window
let rpCurrentLoan = null;  // active loan in repayment form

// Module state — refreshed from window before each read
let allPayments = [], allLoans = [], allBrokers = [], allCustomers = [];
function _refreshState() {
  allPayments = window.allPayments || [];
  allLoans = window.allLoans || [];
  allBrokers = window.allBrokers || [];
  allCustomers = window.allCustomers || [];
}

// ── INTEREST PAYMENTS ────────────────────────────────────────────────────────
async function loadPayments(){
  try{
    const {data,error}=await dbFrom('interest_payments').select('*').order('paid_date',{ascending:false});
    if(error)throw error;
    window.allPayments = data || []; allPayments = window.allPayments;
    filterPayments();
    renderPaymentSummary();
  }catch(e){console.warn('Payment load error:',e)}
}

async function loadInterestPaymentsPage(){
  _refreshState();
  // Fetch brokers directly if not yet loaded
  let brokers = window.allBrokers || [];
  if(!brokers.length){
    try{
      const {data}=await dbFrom('brokers').select('*').order('name');
      if(data){brokers=data; allBrokers=data; window.allBrokers=data;}
    }catch(e){}
  }

  // Populate broker dropdown
  const rpBrokerSel=document.getElementById('rp-broker');
  const current=rpBrokerSel.value;
  rpBrokerSel.innerHTML='<option value="">Select broker…</option>'+
    brokers.map(b=>`<option value="${b.name}">${b.name}</option>`).join('');
  rpBrokerSel.value=current;

  // Populate filter broker dropdown
  const rpFilterBroker=document.getElementById('rp-filter-broker');
  rpFilterBroker.innerHTML='<option value="">All brokers</option>'+
    brokers.map(b=>`<option value="${b.name}">${b.name}</option>`).join('');

  // Set today as default date
  if(!document.getElementById('rp-date').value){
    document.getElementById('rp-date').value=new Date().toISOString().slice(0,10);
  }

  // Generate a preview payment ID (reads window.allPayments)
  const payments = window.allPayments || allPayments || [];
  const now=new Date();
  const preview='IP-'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'-'+String(payments.length+1).padStart(4,'0');
  document.getElementById('rp-payment-id').textContent=preview;

  loadPayments();
}

function previewPaymentId(){
  _refreshState();
  const now=new Date();
  const preview='IP-'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'-'+String(allPayments.length+1).padStart(4,'0');
  document.getElementById('rp-payment-id').textContent=preview;
}

function rpBrokerChanged(){
  _refreshState();
  const broker=document.getElementById('rp-broker').value;
  const creditorSel=document.getElementById('rp-creditor');
  rpCurrentLoan=null;

  if(!broker){
    creditorSel.innerHTML='<option value="">Select broker first…</option>';
    resetLoanFields();
    return;
  }

  // Filter loans belonging to this broker (active loans only)
  const brokerLoans=(window.allLoans||allLoans||[]).filter(l=>l.broker_name===broker&&l.status==='Lending');

  if(!brokerLoans.length){
    creditorSel.innerHTML='<option value="">No active loans for this broker</option>';
    resetLoanFields();
    return;
  }

  creditorSel.innerHTML='<option value="">Select creditor…</option>'+
    brokerLoans.map(l=>`<option value="${l.id}">${l.creditor_name} (${l.id})</option>`).join('');
}

function rpCreditorChanged(){
  _refreshState();
  const loanId=document.getElementById('rp-creditor').value;
  if(!loanId){resetLoanFields();return}

  const loan=allLoans.find(l=>String(l.id)===String(loanId));
  if(!loan){resetLoanFields();return}

  rpCurrentLoan=loan;
  const receivable=Number(loan.capital)*0.08;

  document.getElementById('rp-loan-ref').textContent=loan.id+' · LKR '+fmt(Number(loan.capital))+' capital';
  document.getElementById('rp-loan-ref').style.color='var(--text)';
  document.getElementById('rp-receivable').textContent='LKR '+fmt(receivable);

  // Reset paid and balance
  document.getElementById('rp-paid').value='';
  document.getElementById('rp-balance').textContent='LKR '+fmt(receivable);
  document.getElementById('rp-balance').className='readonly-field balance-pos';

  rpCalcBalance();
}

function rpCalcBalance(){
  if(!rpCurrentLoan)return;
  const receivable=Number(rpCurrentLoan.capital)*0.08;
  const paid=parseFloat(document.getElementById('rp-paid').value)||0;
  const balance=receivable-paid;

  document.getElementById('rp-balance').textContent='LKR '+fmt(balance);
  const balEl=document.getElementById('rp-balance');
  if(balance===0)balEl.className='readonly-field balance-zero';
  else if(balance>0)balEl.className='readonly-field balance-pos';
  else balEl.className='readonly-field balance-neg';
}

function rpDateChanged(){
  previewPaymentId();
}

function resetLoanFields(){
  rpCurrentLoan=null;
  document.getElementById('rp-loan-ref').textContent='— select creditor —';
  document.getElementById('rp-loan-ref').style.color='var(--muted)';
  document.getElementById('rp-receivable').textContent='LKR —';
  document.getElementById('rp-balance').textContent='LKR —';
  document.getElementById('rp-balance').className='readonly-field balance-pos';
  document.getElementById('rp-paid').value='';
}

function resetPaymentForm(){
  document.getElementById('rp-broker').value='';
  document.getElementById('rp-creditor').innerHTML='<option value="">Select broker first…</option>';
  document.getElementById('rp-notes').value='';
  document.getElementById('rp-date').value=new Date().toISOString().slice(0,10);
  resetLoanFields();
  previewPaymentId();
  document.getElementById('rp-msg').textContent='';
}

async function saveInterestPayment(){
  if(!window.canDo?.('interest-payments','add')){showMsg('rp-msg','You do not have permission to add payments.','err');return;}
  if(!rpCurrentLoan){showMsg('rp-msg','Please select a broker and creditor.','err');return}
  const paid=parseFloat(document.getElementById('rp-paid').value)||0;
  if(!paid){showMsg('rp-msg','Please enter the paid amount.','err');return}
  const date=document.getElementById('rp-date').value;
  if(!date){showMsg('rp-msg','Please select a repayment date.','err');return}

  const receivable=Number(rpCurrentLoan.capital)*0.08;
  const balance=receivable-paid;
  const status=balance<=0?'Paid':'Pending';
  const broker=document.getElementById('rp-broker').value;
  const notes=document.getElementById('rp-notes').value.trim();

  // Generate payment ID
  const now=new Date();
  // Query DB for the actual max payment ID to avoid duplicates
  const {data:_existing}=await dbFrom('interest_payments').select('payment_id');
  const _allIds=(_existing||[]).map(p=>parseInt(String(p.payment_id||'').split('-').pop())||0);
  const _maxIdx=_allIds.length?Math.max(..._allIds):0;
  const paymentId='IP-'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0')+'-'+String(_maxIdx+1).padStart(4,'0');

  showMsg('rp-msg','Saving…','ok');

  const {error}=await dbFrom('interest_payments').insert([{
    payment_id:     paymentId,
    nic_number:     rpCurrentLoan?.nic_number || null,
    loan_id:        String(rpCurrentLoan.id),
    creditor_name:  rpCurrentLoan.creditor_name,
    broker_name:    broker,
    paid_date:      date,
    period:         new Date(date).toLocaleDateString('en-LK',{month:'short',year:'2-digit'}),
    receivable_amount: receivable,
    amount:         paid,
    balance:        balance,
    status:         status,
    notes:          notes||null,
  }]);

  if(error){showMsg('rp-msg','Error: '+error.message,'err');return}

  showMsg('rp-msg',`Payment ${paymentId} saved — LKR ${fmt(paid)} · Status: ${status}`,'ok');
  document.getElementById('rp-payment-id').textContent=paymentId;
  resetPaymentForm();
  await loadPayments();
}

function filterPayments(){
  _refreshState();
  const broker=(document.getElementById('rp-filter-broker')?.value||'');
  const status=(document.getElementById('rp-filter-status')?.value||'');
  const q=(document.getElementById('rp-filter-search')?.value||'').toLowerCase();

  const filtered=allPayments.filter(p=>
    (!broker||p.broker_name===broker)&&
    (!status||p.status===status)&&
    (!q||p.creditor_name?.toLowerCase().includes(q)||p.payment_id?.toLowerCase().includes(q))
  );

  const tbody=document.getElementById('rp-tbody');
  if(!tbody)return;

  if(!filtered.length){
    tbody.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:20px;font-size:12px">No payments recorded yet.</td></tr>';
    document.getElementById('rp-footer').textContent='0 payments';
    renderPaymentSummary(filtered);
    return;
  }

  const statusClass={Paid:'rp-status-paid',Partial:'rp-status-partial',Unpaid:'rp-status-unpaid'};
  tbody.innerHTML=filtered.map(p=>{
    const bal=Number(p.balance||0);
    const balColor=bal<=0?'var(--accent)':bal>0?'var(--amber)':'var(--red)';
    return`<tr style="cursor:pointer" onclick="openPayment('${p.id}')">
      <td class="mono" style="font-size:10px;color:var(--muted)">${p.payment_id||'—'}</td>
      <td class="mono" style="color:var(--muted)">${p.paid_date||'—'}</td>
      <td style="font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.creditor_name||'—'}</td>
      <td style="color:var(--muted)">${p.broker_name||'—'}</td>
      <td class="mono" style="color:var(--dim);font-size:10px">${p.loan_id||'—'}</td>
      <td class="mono">LKR ${fmt(Number(p.receivable_amount||0))}</td>
      <td class="mono" style="color:var(--accent)">LKR ${fmt(Number(p.amount||0))}</td>
      <td class="mono" style="color:${balColor}">LKR ${fmt(Math.abs(bal))}${bal<0?' (over)':''}</td>
      <td><span class="badge ${statusClass[p.status]||'bd'}">${p.status||'—'}</span></td>
      <td style="color:var(--dim);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.notes||''}</td>
    </tr>`;
  }).join('');

  const totalReceivable=filtered.reduce((a,p)=>a+Number(p.receivable_amount||0),0);
  const totalPaid=filtered.reduce((a,p)=>a+Number(p.amount||0),0);
  const totalBalance=filtered.reduce((a,p)=>a+Number(p.balance||0),0);
  document.getElementById('rp-footer').textContent=`${filtered.length} payments · Receivable: LKR ${fmt(totalReceivable)} · Collected: LKR ${fmt(totalPaid)} · Outstanding: LKR ${fmt(Math.max(0,totalBalance))}`;
  renderPaymentSummary(filtered);
}

function renderPaymentSummary(filtered){
  const data=filtered||allPayments;
  const strip=document.getElementById('rp-summary-strip');
  if(!strip)return;
  const totalReceivable=data.reduce((a,p)=>a+Number(p.receivable_amount||0),0);
  const totalPaid=data.reduce((a,p)=>a+Number(p.amount||0),0);
  const outstanding=data.reduce((a,p)=>a+Math.max(0,Number(p.balance||0)),0);
  const paidCount=data.filter(p=>p.status==='Paid').length;
  strip.innerHTML=[
    {l:'Total receivable',v:'LKR '+fmtK(totalReceivable),c:'var(--text)'},
    {l:'Total collected',v:'LKR '+fmtK(totalPaid),c:'var(--accent)'},
    {l:'Outstanding',v:'LKR '+fmtK(outstanding),c:'var(--amber)'},
    {l:'Fully paid',v:paidCount+' payments',c:'var(--accent)'},
  ].map(s=>`<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:10px 12px">
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${s.l}</div>
    <div style="font-size:16px;font-weight:700;color:${s.c}">${s.v}</div>
  </div>`).join('');
}


// ── REPAYMENT OVERVIEW ───────────────────────────────────────────────────────
let rovActiveBroker = 'all';

// ── RULE 1: Date helpers — default to 1st–last of current month ───────────────
function rovGetDates(){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const firstDay = new Date(y,m,1).toISOString().slice(0,10);
  const lastDay  = new Date(y,m+1,0).toISOString().slice(0,10);
  const from = document.getElementById('rov-date-from')?.value || firstDay;
  const to   = document.getElementById('rov-date-to')?.value   || lastDay;
  return {from, to};
}

function rovResetDates(){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const firstDay = new Date(y,m,1).toISOString().slice(0,10);
  const lastDay  = new Date(y,m+1,0).toISOString().slice(0,10);
  const f=document.getElementById('rov-date-from');
  const t=document.getElementById('rov-date-to');
  if(f) f.value=firstDay;
  if(t) t.value=lastDay;
  loadRepaymentOverview();
}

function rovInitDates(){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const f=document.getElementById('rov-date-from');
  const t=document.getElementById('rov-date-to');
  if(f && !f.value) f.value=new Date(y,m,1).toISOString().slice(0,10);
  if(t && !t.value) t.value=new Date(y,m+1,0).toISOString().slice(0,10);
}

// ── RULE 2: Filter loans — must have ≥1 month active ─────────────────────────
function rovEligibleLoans(){
  return allLoans.filter(l=>
    l.status==='Lending' &&
    moActive(l.start_date) >= 1    // Rule 2: skip loans < 1 month old
  );
}

function loadRepaymentOverview(){
  _refreshState();
  rovInitDates();
  const {from,to} = rovGetDates();
  // Update period label
  const lbl = document.getElementById('rov-period-label');
  if(lbl) lbl.textContent = from + ' → ' + to;
  renderROVSummary(from,to);
  renderROVBrokerTabs();
  renderROVBrokerPanels(rovActiveBroker, from, to);
}

function renderROVSummary(from,to){
  const el=document.getElementById('rov-summary');
  if(!el)return;

  const eligible = rovEligibleLoans();
  const totalReceivable = eligible.reduce((a,l)=>a+loanMonthlyIncome(l),0);

  // Payments within date range
  const periodPayments = allPayments.filter(p=>{
    if(!p.paid_date) return false;
    return p.paid_date >= from && p.paid_date <= to;
  });
  const totalPaid        = periodPayments.reduce((a,p)=>a+Number(p.amount||0),0);
  const totalOutstanding = eligible.reduce((a,l)=>{
    const loanPmts = periodPayments.filter(p=>String(p.loan_id)===String(l.id));
    const paid = loanPmts.reduce((s,p)=>s+Number(p.amount||0),0);
    return a + Math.max(0, loanMonthlyIncome(l) - paid);
  },0);
  const paidFull  = periodPayments.filter(p=>p.status==='Paid').length;
  const partial   = periodPayments.filter(p=>p.status==='Partial').length;

  el.innerHTML=[
    {l:'Monthly receivable',v:'LKR '+fmtK(totalReceivable),c:'var(--text)',sub:eligible.length+' eligible loans'},
    {l:'Collected (period)',v:'LKR '+fmtK(totalPaid),c:'var(--accent)',sub:periodPayments.length+' payments'},
    {l:'Outstanding',v:'LKR '+fmtK(totalOutstanding),c:'var(--amber)',sub:partial+' partial'},
    {l:'Fully paid',v:paidFull+' payments',c:'var(--accent)',sub:'in selected period'},
  ].map(s=>`<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px">
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${s.l}</div>
    <div style="font-size:18px;font-weight:700;color:${s.c};line-height:1">${s.v}</div>
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);margin-top:4px">${s.sub}</div>
  </div>`).join('');
}

function renderROVBrokerTabs(){
  const el=document.getElementById('rov-broker-tabs');
  if(!el)return;
  // Only show brokers who have eligible loans (≥1 month active)
  const eligible = rovEligibleLoans();
  const brokers=['all',...new Set(eligible.map(l=>l.broker_name))].sort();
  el.innerHTML=brokers.map(b=>`
    <div onclick="rovSetBroker('${b}')"
      style="padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'DM Mono',monospace;
      background:${rovActiveBroker===b?'var(--accent)':'var(--card)'};
      color:${rovActiveBroker===b?'#0a0f0a':'var(--muted)'};
      border:1px solid ${rovActiveBroker===b?'var(--accent)':'var(--border)'}">
      ${b==='all'?'All brokers':b}
    </div>`).join('');
}

function rovSetBroker(broker){
  rovActiveBroker=broker;
  const {from,to}=rovGetDates();
  renderROVBrokerTabs();
  renderROVBrokerPanels(broker,from,to);
}

function renderROVBrokerPanels(filterBroker, from, to){
  _refreshState();
  const container=document.getElementById('rov-broker-panels');
  if(!container)return;
  if(!from||!to){const d=rovGetDates();from=d.from;to=d.to;}

  // Rule 2: only eligible loans (≥1 month active)
  const eligible = rovEligibleLoans();
  let brokers=[...new Set(eligible.map(l=>l.broker_name))].sort();
  if(filterBroker!=='all') brokers=brokers.filter(b=>b===filterBroker);

  if(!brokers.length){
    container.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:40px">No eligible loans found for this period.<br><span style="font-size:11px;font-family:monospace">Loans must be active for at least 1 month to appear here.</span></div>';
    return;
  }

  // Period payments
  const periodPayments = allPayments.filter(p=>p.paid_date && p.paid_date>=from && p.paid_date<=to);

  container.innerHTML=brokers.map(broker=>{
    const brokerLoans=eligible.filter(l=>l.broker_name===broker);

    // Rule 3: group creditors by pay_date within each broker panel
    const payDays=[...new Set(brokerLoans.map(l=>l.pay_date||10))].sort((a,b)=>a-b);

    const brokerPeriodPayments=periodPayments.filter(p=>p.broker_name===broker);
    const totalReceivable=brokerLoans.reduce((a,l)=>a+loanMonthlyIncome(l),0);
    const totalPaid=brokerPeriodPayments.reduce((a,p)=>a+Number(p.amount||0),0);
    const outstanding=brokerLoans.reduce((a,l)=>{
      const lp=brokerPeriodPayments.filter(p=>String(p.loan_id)===String(l.id));
      const paid=lp.reduce((s,p)=>s+Number(p.amount||0),0);
      return a+Math.max(0,loanMonthlyIncome(l)-paid);
    },0);
    const pct=totalReceivable>0?Math.min(100,(totalPaid/totalReceivable)*100):0;

    // Rule 3: build pay-day groups
    const payDayGroups = payDays.map(day=>{
      const dayLoans = brokerLoans.filter(l=>(l.pay_date||10)===day);
      const dayReceivable = dayLoans.reduce((a,l)=>a+loanMonthlyIncome(l),0);

      const creditorRows = dayLoans.map(loan=>{
        const loanPeriodPmts = brokerPeriodPayments.filter(p=>String(p.loan_id)===String(loan.id));
        const allLoanPmts    = allPayments.filter(p=>String(p.loan_id)===String(loan.id));
        const loanReceivable = loanMonthlyIncome(loan);
        const loanPaid       = loanPeriodPmts.reduce((a,p)=>a+Number(p.amount||0),0);
        const loanBalance    = loanReceivable - loanPaid;
        const loanStatus     = loanBalance<=0?'Paid':loanPaid>0?'Partial':'Unpaid';
        const statusCls      = loanStatus==='Paid'?'rp-status-paid':loanStatus==='Partial'?'rp-status-partial':'rp-status-unpaid';
        const panelId        = 'cr-'+String(loan.id).replace(/\W/g,'');

        const paymentHistoryRows = loanPeriodPmts.length
          ? loanPeriodPmts.sort((a,b)=>new Date(b.paid_date)-new Date(a.paid_date)).map(p=>`
              <div class="payment-row">
                <div class="payment-row-left">
                  <span class="mono" style="font-size:10px;color:var(--dim)">${p.payment_id||'—'}</span>
                  <span class="mono" style="color:var(--muted)">${p.paid_date||'—'}</span>
                  <span style="color:var(--muted)">${p.period||'—'}</span>
                </div>
                <div class="payment-row-right">
                  <span class="mono" style="color:var(--muted);font-size:11px">Due: LKR ${fmt(Number(p.receivable_amount||0))}</span>
                  <span class="mono" style="color:var(--accent);font-weight:600">Paid: LKR ${fmt(Number(p.amount||0))}</span>
                  <span class="mono" style="color:${Number(p.balance||0)>0?'var(--amber)':'var(--accent)'};font-size:11px">Bal: LKR ${fmt(Math.abs(Number(p.balance||0)))}</span>
                  <span class="badge ${p.status==='Paid'?'rp-status-paid':p.status==='Partial'?'rp-status-partial':'rp-status-unpaid'}">${p.status}</span>
                </div>
              </div>`).join('')
          : '<div class="no-payments">No payments in this period</div>';

        return `<div class="creditor-row">
          <div class="creditor-row-header" onclick="toggleCreditor('${panelId}')">
            <div>
              <div class="creditor-name">${loan.creditor_name}</div>
              <div class="creditor-meta">${loan.id} · LKR ${fmt(Number(loan.capital))} · ${moActive(loan.start_date).toFixed(1)} months active</div>
            </div>
            <div class="creditor-badges">
              <span class="mono" style="font-size:11px;color:var(--muted)">Due: LKR ${fmt(loanReceivable)}/mo</span>
              <span class="mono" style="font-size:11px;color:var(--accent)">Paid: LKR ${fmt(loanPaid)}</span>
              <span class="mono" style="font-size:11px;color:${loanBalance>0?'var(--amber)':'var(--accent)'}">Bal: LKR ${fmt(Math.abs(loanBalance))}</span>
              <span class="badge ${statusCls}">${loanStatus}</span>
              <span style="font-size:10px;color:var(--dim)" id="chev-${panelId}">▾</span>
            </div>
          </div>
          <div class="creditor-payment-list" id="${panelId}">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0 8px;border-bottom:1px solid var(--border);margin-bottom:4px">
              <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em">${loanPeriodPmts.length} payment${loanPeriodPmts.length!==1?'s':''} in period · ${allLoanPmts.length} total</span>
              <button class="btn btn-primary btn-sm" style="font-size:10px;padding:3px 10px" onclick="goToPaymentFor('${loan.broker_name}','${loan.id}')">+ Record</button>
            </div>
            ${paymentHistoryRows}
          </div>
        </div>`;
      }).join('');

      return `<div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;background:var(--bg);border-radius:var(--radius)">
          <span style="background:var(--blue-bg);color:var(--blue);font-family:'DM Mono',monospace;font-size:11px;padding:2px 10px;border-radius:20px;font-weight:500">Pay day ${day}</span>
          <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--accent);font-weight:600">LKR ${fmt(dayReceivable)} due</span>
          <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--dim)">${dayLoans.length} loan${dayLoans.length!==1?'s':''}</span>
        </div>
        ${creditorRows}
      </div>`;
    }).join('');

    const brokerId='bp-'+broker.replace(/\s+/g,'_');
    return`<div class="broker-panel">
      <div class="broker-panel-header" onclick="toggleBrokerPanel('${brokerId}')" id="hdr-${brokerId}">
        <div class="broker-panel-left">
          <div>
            <div class="broker-panel-name">${broker}</div>
            <div class="broker-panel-meta">${brokerLoans.length} creditor${brokerLoans.length!==1?'s':''}</div>
          </div>
          <div style="width:100px;background:var(--border);border-radius:4px;height:5px;overflow:hidden;margin-left:4px">
            <div style="height:100%;border-radius:4px;background:var(--accent);width:${pct.toFixed(0)}%"></div>
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)">${pct.toFixed(0)}% collected</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="broker-stat"><span>Receivable </span><strong>LKR ${fmtK(totalReceivable)}/mo</strong></div>
          <div class="broker-stat green"><span>Collected </span><strong>LKR ${fmtK(totalPaid)}</strong></div>
          <div class="broker-stat ${outstanding>0?'amber':'green'}"><span>Outstanding </span><strong>LKR ${fmtK(outstanding)}</strong></div>
          <span class="broker-panel-chevron" id="chev-${brokerId}">▾</span>
        </div>
      </div>
      <div class="broker-panel-body" id="${brokerId}">
        ${payDayGroups}
      </div>
    </div>`;
  }).join('');
}

function toggleBrokerPanel(id){
  const body=document.getElementById(id);
  const hdr=document.getElementById('hdr-'+id);
  const chev=document.getElementById('chev-'+id);
  const isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  if(hdr)hdr.classList.toggle('open',!isOpen);
  if(chev)chev.classList.toggle('open',!isOpen);
}

function toggleCreditor(id){
  const body=document.getElementById(id);
  const chev=document.getElementById('chev-'+id);
  const isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  if(chev)chev.textContent=isOpen?'▾':'▴';
}

function goToPaymentFor(brokerName,loanId){
  navTo('interest-payments');
  // Pre-select broker then creditor after a short delay for DOM to render
  setTimeout(()=>{
    const brokerSel=document.getElementById('rp-broker');
    if(brokerSel){brokerSel.value=brokerName;rpBrokerChanged();}
    setTimeout(()=>{
      const credSel=document.getElementById('rp-creditor');
      if(credSel){credSel.value=String(loanId);rpCreditorChanged();}
    },100);
  },200);
}

// ── DETAIL PAGES ─────────────────────────────────────────────────────────────

// State IDs and helpers stay in index.html

// ── PAYMENT DETAIL ────────────────────────────────────────────────────────────
function openPayment(id){
  _refreshState();
  const p=allPayments.find(x=>x.id===id||String(x.id)===String(id));
  if(!p) return;
  currentPaymentId=p.id; window.currentPaymentId=currentPaymentId;

  document.getElementById('pd-page-title').textContent='Payment — '+(p.payment_id||p.id);
  document.getElementById('pd-id').textContent='Payment ID: '+(p.payment_id||'—');
  document.getElementById('pd-title').textContent=p.creditor_name||'—';
  document.getElementById('pd-meta').textContent=(p.broker_name||'')+(p.paid_date?' · '+p.paid_date:'')+(p.status?' · '+p.status:'');

  document.getElementById('pd-payment-id').value=p.payment_id||'';
  document.getElementById('pd-date').value=p.paid_date||'';
  document.getElementById('pd-status').value=p.status||'Pending';
  document.getElementById('pd-creditor').value=p.creditor_name||'';
  document.getElementById('pd-broker').value=p.broker_name||'';
  document.getElementById('pd-loan-ref').value=p.loan_id||'';
  document.getElementById('pd-receivable').value='LKR '+fmt(Number(p.receivable_amount||0));
  document.getElementById('pd-paid').value=p.amount||'';
  document.getElementById('pd-balance').value='LKR '+fmt(Math.abs(Number(p.balance||0)));
  document.getElementById('pd-notes').value=p.notes||'';

  {const _u=document.getElementById('pd-unsaved');if(_u)_u.style.display='none';}
  document.getElementById('pd-msg').textContent='';
  document.querySelectorAll('.page').forEach(p2=>p2.classList.remove('active'));
  document.getElementById('page-payment-detail').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('nav-interest-payments').classList.add('active');
  document.getElementById('page-title').textContent='Payment Detail';
  closeMob(); window.scrollTo(0,0);
}

function pdCalcBalance(){
  const receivable=parseFloat(document.getElementById('pd-receivable').value.replace(/[^0-9.]/g,''))||0;
  const paid=parseFloat(document.getElementById('pd-paid').value)||0;
  const balance=receivable-paid;
  document.getElementById('pd-balance').value='LKR '+fmt(Math.abs(balance));
  const status=balance<=0?'Paid':'Pending';
  document.getElementById('pd-status').value=status;
}

async function savePaymentEdit(){
  if(!window.canDo?.('interest-payments','edit')){showMsg('pd-msg','You do not have permission to edit payments.','err');return;}
  const id=currentPaymentId; if(!id) return;
  const receivable=parseFloat(document.getElementById('pd-receivable').value.replace(/[^0-9.]/g,''))||0;
  const paid=parseFloat(document.getElementById('pd-paid').value)||0;
  const balance=receivable-paid;
  const status=balance<=0?'Paid':'Pending';
  const updates={
    paid_date:   document.getElementById('pd-date').value,
    amount:      paid,
    balance,
    status,
    notes:       document.getElementById('pd-notes').value.trim()||null,
  };
  showMsg('pd-msg','Saving…','ok');
  const {error}=await dbFrom('interest_payments').update(updates).eq('id',id);
  if(error){showMsg('pd-msg','Error: '+error.message,'err');return}
  showMsg('pd-msg','Saved.','ok');
  {const _u=document.getElementById('pd-unsaved');if(_u)_u.style.display='none';}
  document.getElementById('pd-meta').textContent=(document.getElementById('pd-broker').value||'')+(updates.paid_date?' · '+updates.paid_date:'')+(status?' · '+status:'');
  await loadPayments();
}

async function deletePayment(){
  if(!window.canDo?.('interest-payments','delete')){showMsg('pd-msg','You do not have permission to delete payments.','err');return;}
  if(!currentPaymentId) return;
  if(!confirm('Delete this payment record? This cannot be undone.')) return;
  const {error}=await dbFrom('interest_payments').delete().eq('id',currentPaymentId);
  if(error){alert('Error: '+error.message);return}
  await loadPayments();
  navTo('interest-payments');
}


// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  loadPayments, loadInterestPaymentsPage, previewPaymentId,
  rpBrokerChanged, rpCreditorChanged, rpCalcBalance, rpDateChanged,
  resetPaymentForm, saveInterestPayment, filterPayments, renderPaymentSummary,
  rovGetDates, rovResetDates, rovInitDates, rovEligibleLoans,
  loadRepaymentOverview, renderROVSummary, renderROVBrokerTabs, rovSetBroker,
  renderROVBrokerPanels, toggleBrokerPanel, toggleCreditor, goToPaymentFor,
  openPayment, pdCalcBalance, savePaymentEdit, deletePayment,
});
