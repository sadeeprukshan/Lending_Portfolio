// ── loans.js ───────────────────────────────────────────────────────────────
// Loans table, add loan, loan detail, file handling, creditor search.
// Reads shared state from window.* (set by loadAll / state.js).
// Uses helpers (fmt, fmtK, moActive, sBadge, dBadge, showMsg) from window.*.

import { dbFrom } from '/js/db.js';
import { fmt, fmtK, moActive, sBadge, dBadge, showMsg, loanMonthlyIncome } from '/js/helpers.js';

let currentLoanId = null;  // module-scoped state ID, mirrored to window

let uploadedFiles = { promissory: null, id: null, mortgage: null };
let selectedDate = null;
let searchResults = [];
let selectedCreditor = null;


// ── LOANS_TABLE ──
// ── LOANS TABLE ───────────────────────────────────────────────────────────────
function buildLoansTable(data){
  if(!data.length)return'<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">No loans found.</div>';
  const rows=data.map(l=>{
    const mo=moActive(l.start_date),earned=loanMonthlyIncome(l)*mo,monthly=loanMonthlyIncome(l);
    const docs=dBadge('P',l.has_promissory)+dBadge('I',l.id_document_url||l.has_id_copy)+(Number(l.capital)>=300000?dBadge('M',l.has_mortgage):'');
    return`<tr style="cursor:pointer" onclick="openLoan('${l.id}')">
      <td class="mono" style="color:var(--dim);font-size:10px">${l.id}</td>
      <td class="tbl-name">${l.creditor_name}</td>
      <td class="mono">LKR ${fmt(Number(l.capital))}</td>
      <td class="mono" style="font-size:10px;color:var(--muted)">${l.rate_pm||8}% ${(l.interest_period||'monthly').substring(0,2)}</td>
      <td>${l.broker_name}</td>
      <td class="mono" style="color:var(--muted)">${new Date(l.start_date).toLocaleDateString('en-LK',{month:'short',year:'2-digit'})}</td>
      <td class="mono" style="color:var(--muted)">${mo.toFixed(1)}</td>
      <td class="mono" style="color:var(--accent)">${fmt(earned)}</td>
      <td class="mono" style="color:var(--accent)">${fmt(monthly)}</td>
      <td class="mono" style="color:var(--muted)">${l.pay_date||'—'}th</td>
      <td>${docs}</td>
      <td>${sBadge(l.status)}</td>
    </tr>`;
  }).join('');
  return`<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Facility</th><th>Creditor</th><th>Capital</th><th>Rate</th><th>Broker</th><th>Start</th><th>Months</th><th>Earned</th><th>Monthly</th><th>Pay</th><th>Docs</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function populateBrokerFilter(){
  const bs=[...new Set(allLoans.map(l=>l.broker_name))].sort();
  document.getElementById('loans-broker-filter').innerHTML='<option value="">All brokers</option>'+bs.map(b=>`<option>${b}</option>`).join('');
}
function renderLoansTable(){filterLoans()}
function filterLoans(){
  const q=(document.getElementById('loans-search').value||'').toLowerCase();
  const sb2=document.getElementById('loans-broker-filter').value;
  const ss=document.getElementById('loans-status-filter').value;
  const f=allLoans.filter(l=>(!q||l.creditor_name.toLowerCase().includes(q)||l.broker_name.toLowerCase().includes(q)||String(l.id).includes(q))&&(!sb2||l.broker_name===sb2)&&(!ss||l.status===ss));
  document.getElementById('loans-tbody').innerHTML=f.map(l=>{
    const mo=moActive(l.start_date),earned=loanMonthlyIncome(l)*mo,monthly=loanMonthlyIncome(l);
    const docs=dBadge('P',l.has_promissory)+dBadge('I',l.id_document_url||l.has_id_copy)+(Number(l.capital)>=300000?dBadge('M',l.has_mortgage):'');
    return`<tr style="cursor:pointer" onclick="openLoan('${l.id}')"><td class="mono" style="color:var(--dim);font-size:10px">${l.id}</td><td class="tbl-name">${l.creditor_name}</td><td class="mono">LKR ${fmt(Number(l.capital))}</td><td>${l.broker_name}</td><td class="mono" style="color:var(--muted)">${new Date(l.start_date).toLocaleDateString('en-LK',{month:'short',year:'2-digit'})}</td><td class="mono" style="color:var(--muted)">${mo.toFixed(1)}</td><td class="mono" style="color:var(--accent)">${fmt(earned)}</td><td class="mono" style="color:var(--accent)">${fmt(monthly)}</td><td class="mono" style="color:var(--muted)">${l.pay_date||'—'}th</td><td>${docs}</td><td>${sBadge(l.status)}</td></tr>`;
  }).join('');
  const tot=f.reduce((a,l)=>a+Number(l.capital),0),totM=f.reduce((a,l)=>a+loanMonthlyIncome(l),0);
  document.getElementById('loans-footer').textContent=`${f.length} loans · Capital: LKR ${fmt(tot)} · Monthly: LKR ${fmt(totM)}`;
  document.getElementById('loan-count-badge').textContent=f.length;
}



// ── FILE_HANDLING ──
// ── FILE HANDLING ─────────────────────────────────────────────────────────────
function handleFile(type,input){
  const file=input.files[0];if(!file)return;
  if(file.size>5*1024*1024){alert('File too large. Max 5MB.');input.value='';return}
  uploadedFiles[type]=file;
  const icon=file.type.includes('pdf')?'📄':'🖼';
  document.getElementById('preview-'+type).innerHTML=`<div class="file-preview-item"><span class="fp-icon">${icon}</span><span class="fp-name">${file.name}</span><span class="fp-remove" onclick="removeFile('${type}')">✕</span></div>`;
  // Show mortgage required indicator
  if(type==='promissory'){const c=parseFloat(document.getElementById('f-capital').value)||0;document.getElementById('mort-required-label').textContent=c>=300000?'(required — loan ≥300K)':'(required if ≥300K)';document.getElementById('mort-required-label').style.color=c>=300000?'var(--amber)':'var(--dim)'}
}
function removeFile(type){uploadedFiles[type]=null;document.getElementById('file-'+type).value='';document.getElementById('preview-'+type).innerHTML=''}



// ── CREDITOR ──
// ── CREDITOR SEARCH DROPDOWN — customers table only ──────────────────────────
function creditorSearch(query){
  const dropdown=document.getElementById('creditor-dropdown');
  const q=query.trim().toLowerCase();

  // Source: customers table only (customer = creditor, same entity)
  const candidates=allCustomers.map(c=>({
    id:      c.id,
    name:    c.full_name,
    nic:     c.nic_number||'',
    phone:   c.phone||'',
    broker:  c.broker_name||'',
    address: c.address||''
  }));

  const filtered=q
    ? candidates.filter(c=>
        c.name.toLowerCase().includes(q)||
        c.nic.toLowerCase().includes(q)||
        c.phone.toLowerCase().includes(q)
      )
    : candidates;

  if(!candidates.length){
    dropdown.innerHTML=`<div style="padding:10px 12px;font-size:11px;color:var(--dim)">No customers in database. <span style="color:var(--accent);cursor:pointer" onclick="navTo('add-customer')">Add customer first →</span></div>`;
    dropdown.style.display='block';
    return;
  }

  if(!filtered.length){
    dropdown.innerHTML=`<div style="padding:10px 12px;font-size:11px;color:var(--dim)">No match found. <span style="color:var(--accent);cursor:pointer" onclick="navTo('add-customer')">Add new customer →</span></div>`;
    dropdown.style.display='block';
    return;
  }

  window._creditorSearchResults=filtered.slice(0,20);
  dropdown.innerHTML=filtered.slice(0,20).map((c,i)=>`
    <div data-i="${i}" onclick="selectCreditorAt(${i})"
      style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s"
      onmouseover="this.style.background='rgba(255,255,255,.04)'"
      onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:12px;color:var(--text)">${c.name}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">
        ${c.nic?`<span style="font-family:monospace">NIC: ${c.nic}</span>&nbsp;&middot;&nbsp;`:''}
        ${c.broker?`Broker: ${c.broker}`:'<span style="color:var(--dim)">No broker</span>'}
        ${c.phone?`&nbsp;&middot;&nbsp;${c.phone}`:''}
      </div>
    </div>`).join('');
  dropdown.style.display='block';
}

function selectCreditorAt(i){
  const c=(window._creditorSearchResults||[])[i];
  if(c) selectCreditor(c);
}

function selectCreditor(c){
  document.getElementById('f-name').value=c.name;
  document.getElementById('f-customer-id').value=c.id||'';
  document.getElementById('f-nic').value=c.nic||'';
  const brokerSel=document.getElementById('f-broker');
  if(c.broker&&!brokerSel.value) brokerSel.value=c.broker;
  document.getElementById('f-name-search').value=c.name;
  const badge=document.getElementById('f-selected-customer');
  const label=document.getElementById('f-selected-label');
  label.textContent=c.name+(c.nic?' · '+c.nic:'')+(c.broker?' · '+c.broker:'');
  badge.style.display='flex';
  document.getElementById('creditor-dropdown').style.display='none';
}

function clearCreditorSelection(){
  document.getElementById('f-name').value='';
  document.getElementById('f-name-search').value='';
  document.getElementById('f-customer-id').value='';
  document.getElementById('f-nic').value='';
  document.getElementById('f-selected-customer').style.display='none';
  document.getElementById('f-name-search').focus();
}

// Close dropdown when clicking outside
document.addEventListener('click',function(e){
  const dd=document.getElementById('creditor-dropdown');
  if(dd&&!dd.contains(e.target)&&e.target.id!=='f-name-search'){
    dd.style.display='none';
  }
  // Also handle the loan-detail creditor dropdown
  const ldDd=document.getElementById('ld-creditor-dropdown');
  if(ldDd&&!ldDd.contains(e.target)&&e.target.id!=='ld-creditor-search'){
    ldDd.style.display='none';
  }
});



// ── ADD_LOAN ──
// ── ADD LOAN ──────────────────────────────────────────────────────────────────
function loanPreview(){
  const c=parseFloat(document.getElementById('f-capital').value)||0;
  const r=parseFloat(document.getElementById('f-rate')?.value)||8;
  const per=document.getElementById('f-period')?.value||'monthly';
  document.getElementById('loan-preview').textContent=c>0?`Monthly interest: LKR ${fmt((per==='annually' ? c*r/100/12 : c*r/100))}  ·  Annual: LKR ${fmt((per==='annually' ? c*r/100/12 : c*r/100)*12)}  ·  Mortgage required: ${c>=300000?'YES (≥300K)':'No'}`:'Enter capital to preview interest calculation.';
  const ml=document.getElementById('mort-required-label');
  if(ml)ml.textContent=c>=300000?'(required — loan ≥300K)':'(required if ≥300K)';
  if(ml)ml.style.color=c>=300000?'var(--amber)':'var(--dim)';
}

async function saveLoan(){
  if(!window.canDo?.('loans','add')){showMsg('add-msg','You do not have permission to add loans.','err');return;}
  const name=document.getElementById('f-name').value.trim()||document.getElementById('f-name-search').value.trim();
  const nic=document.getElementById('f-nic').value.trim();
  const broker=document.getElementById('f-broker').value;
  const capital=parseFloat(document.getElementById('f-capital').value)||0;
  const month=document.getElementById('f-month').value.trim();
  const payDate=parseInt(document.getElementById('f-paydate').value)||10;
  const status=document.getElementById('f-status').value;
  const rate=parseFloat(document.getElementById('f-rate')?.value)||8;
  const period=document.getElementById('f-period')?.value||'monthly';
  if(!name||!broker||!capital||!month){showMsg('add-msg','Please fill all required fields (name, broker, capital, month).','err');return}

  const maxId=allLoans.reduce((a,l)=>Math.max(a,parseInt(l.id)||0),25000000);
  const newId=String(maxId+1);
  const monthMap={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  const [m,y]=month.split('-');
  const startDate=`20${y}-${monthMap[m]||'01'}-01`;

  showMsg('add-msg','Saving…','ok');

  // Upload files to Supabase Storage if they exist
  let promissoryUrl=null,idUrl=null,mortgageUrl=null;
  try{
    if(uploadedFiles.promissory){const path=`${newId}/promissory_${Date.now()}.${uploadedFiles.promissory.name.split('.').pop()}`;const {error:ue}=await window.sb.storage.from('loan-documents').upload(path,uploadedFiles.promissory,{upsert:true});if(!ue)promissoryUrl=window.sb.storage.from('loan-documents').getPublicUrl(path).data.publicUrl}
    if(uploadedFiles.id){const path=`${newId}/id_${Date.now()}.${uploadedFiles.id.name.split('.').pop()}`;const {error:ue}=await window.sb.storage.from('loan-documents').upload(path,uploadedFiles.id,{upsert:true});if(!ue)idUrl=window.sb.storage.from('loan-documents').getPublicUrl(path).data.publicUrl}
    if(uploadedFiles.mortgage){const path=`${newId}/mortgage_${Date.now()}.${uploadedFiles.mortgage.name.split('.').pop()}`;const {error:ue}=await window.sb.storage.from('loan-documents').upload(path,uploadedFiles.mortgage,{upsert:true});if(!ue)mortgageUrl=window.sb.storage.from('loan-documents').getPublicUrl(path).data.publicUrl}
  }catch(e){console.warn('File upload error:',e)}

  const {error}=await dbFrom('loans').insert([{
    id:newId,creditor_name:name,nic_number:nic||null,broker_name:broker,
    capital,rate_pm:rate,interest_period:period,month_invested:month,start_date:startDate,
    pay_date:payDate,status,
    has_promissory:!!uploadedFiles.promissory,
    has_mortgage:!!uploadedFiles.mortgage,
    promissory_document_url:promissoryUrl,
    id_document_url:idUrl,
    mortgage_document_url:mortgageUrl,
  }]);

  if(error){showMsg('add-msg','Error: '+error.message,'err');return}
  const monthlyIncome = period==='annually' ? (capital*rate/100/12) : (capital*rate/100);
  showMsg('add-msg',`Loan ${newId} saved — LKR ${fmt(capital)} · ${rate}% ${period} · Monthly: LKR ${fmt(monthlyIncome)}`,'ok');
  ['f-name','f-nic','f-capital','f-paydate'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-month').value='';
  document.getElementById('date-display-text').textContent='Select month…';
  document.getElementById('date-display-text').style.color='var(--dim)';
  selectedDate=null;
  removeFile('promissory');removeFile('id');removeFile('mortgage');
  loadAll();
  setTimeout(()=>navTo('loans'),1800);
}

// showMsg imported from helpers.js



// ── LOAN_DETAIL ──
// ── LOAN DETAIL ───────────────────────────────────────────────────────────────
function openLoan(id){
  const loan=allLoans.find(l=>String(l.id)===String(id));
  if(!loan) return;
  currentLoanId=id; window.currentLoanId=id;
  const r=parseFloat(loan.rate_pm)||8;
  const per=loan.interest_period||'monthly';
  const monthly=per==='annually' ? (Number(loan.capital)*r/100/12) : (Number(loan.capital)*r/100);

  document.getElementById('ld-page-title').textContent='Loan — '+loan.id;
  document.getElementById('ld-id').textContent='Facility No: '+loan.id;
  document.getElementById('ld-name').textContent=loan.creditor_name;
  document.getElementById('ld-meta').textContent=
    `LKR ${fmt(Number(loan.capital))} capital · ${loan.broker_name} · ${loan.status}`;

  document.getElementById('ld-creditor').value=loan.creditor_name||'';
  document.getElementById('ld-rate').value=loan.rate_pm||8;
  document.getElementById('ld-period').value=loan.interest_period||'monthly';
  document.getElementById('ld-creditor-search').value=loan.creditor_name||'';
  // Try to find matching customer for the badge
  const matchedCustomer = (window.allCustomers||[]).find(c => 
    c.full_name === loan.creditor_name || 
    (loan.nic_number && c.nic_number === loan.nic_number)
  );
  if (matchedCustomer) {
    document.getElementById('ld-customer-id').value = matchedCustomer.id || '';
    const badge = document.getElementById('ld-selected-customer');
    const label = document.getElementById('ld-selected-label');
    if (label) label.textContent = matchedCustomer.full_name + (matchedCustomer.nic_number ? ' · ' + matchedCustomer.nic_number : '');
    if (badge) badge.style.display = 'flex';
  }
  document.getElementById('ld-nic').value=loan.nic_number||'';
  document.getElementById('ld-capital').value=loan.capital||'';
  document.getElementById('ld-month').value=loan.month_invested||'';
  document.getElementById('ld-startdate').value=loan.start_date||'';
  document.getElementById('ld-paydate').value=loan.pay_date||'';
  document.getElementById('ld-monthly').value='LKR '+fmt(monthly)+'/month';
  document.getElementById('ld-status').value=loan.status||'Lending';

  // Populate broker dropdown
  const ldBroker=document.getElementById('ld-broker');
  ldBroker.innerHTML='<option value="">Select broker</option>'+allBrokers.map(b=>`<option value="${b.name}" ${b.name===loan.broker_name?'selected':''}>${b.name}</option>`).join('');
  if(!allBrokers.length) ldBroker.innerHTML=`<option value="${loan.broker_name}">${loan.broker_name}</option>`;

  // Documents are managed via the Documents page (click Documents button)

  // Payment history
  const payments=allPayments.filter(p=>String(p.loan_id)===String(id));
  const ptbody=document.getElementById('ld-payments-tbody');
  ptbody.innerHTML=payments.length
    ? payments.sort((a,b)=>new Date(b.paid_date)-new Date(a.paid_date)).map(p=>`
        <tr style="cursor:pointer" onclick="openPayment('${p.id}')">
          <td class="mono" style="font-size:10px;color:var(--muted)">${p.payment_id||'—'}</td>
          <td class="mono">${p.paid_date||'—'}</td>
          <td class="mono">LKR ${fmt(Number(p.receivable_amount||0))}</td>
          <td class="mono" style="color:var(--accent)">LKR ${fmt(Number(p.amount||0))}</td>
          <td class="mono" style="color:${Number(p.balance||0)>0?'var(--amber)':'var(--accent)'}">LKR ${fmt(Math.abs(Number(p.balance||0)))}</td>
          <td><span class="badge ${p.status==='Paid'?'rp-status-paid':p.status==='Partial'?'rp-status-partial':'rp-status-unpaid'}">${p.status}</span></td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">No payments recorded</td></tr>';

  {const _u=document.getElementById('ld-unsaved');if(_u)_u.style.display='none';}
  document.getElementById('ld-msg').textContent='';

  // Show detail page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-loan-detail').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('nav-loans').classList.add('active');
  document.getElementById('page-title').textContent='Loan Detail';
  closeMob(); window.scrollTo(0,0);
}

// ── Loan Detail: Creditor dropdown (same as Add New Loan) ────────────────
function ldCreditorSearch(query){
  const dropdown=document.getElementById('ld-creditor-dropdown');
  if(!dropdown) return;
  const q=(query||'').trim().toLowerCase();

  const candidates=(window.allCustomers||[]).map(c=>({
    id:      c.id,
    name:    c.full_name,
    nic:     c.nic_number||'',
    phone:   c.phone||'',
    broker:  c.broker_name||'',
    address: c.address||''
  }));

  const filtered=q
    ? candidates.filter(c=>
        c.name.toLowerCase().includes(q)||
        c.nic.toLowerCase().includes(q)||
        c.phone.toLowerCase().includes(q)
      )
    : candidates;

  if(!candidates.length){
    dropdown.innerHTML=`<div style="padding:10px 12px;font-size:11px;color:var(--dim)">No customers in database. <span style="color:var(--accent);cursor:pointer" onclick="navTo('add-customer')">Add customer first &rarr;</span></div>`;
    dropdown.style.display='block';
    return;
  }

  if(!filtered.length){
    dropdown.innerHTML=`<div style="padding:10px 12px;font-size:11px;color:var(--dim)">No match found. <span style="color:var(--accent);cursor:pointer" onclick="navTo('add-customer')">Add new customer &rarr;</span></div>`;
    dropdown.style.display='block';
    return;
  }

  window._ldCreditorSearchResults=filtered.slice(0,20);
  dropdown.innerHTML=filtered.slice(0,20).map((c,i)=>`
    <div data-i="${i}" onclick="ldSelectCreditorAt(${i})"
      style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s"
      onmouseover="this.style.background='rgba(255,255,255,.04)'"
      onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:12px;color:var(--text)">${c.name}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">
        ${c.nic?`<span style="font-family:monospace">NIC: ${c.nic}</span>&nbsp;&middot;&nbsp;`:''}
        ${c.broker?`Broker: ${c.broker}`:'<span style="color:var(--dim)">No broker</span>'}
        ${c.phone?`&nbsp;&middot;&nbsp;${c.phone}`:''}
      </div>
    </div>`).join('');
  dropdown.style.display='block';
}

function ldSelectCreditorAt(i){
  const c=window._ldCreditorSearchResults?.[i];
  if(c) ldSelectCreditor(c);
}

function ldSelectCreditor(c){
  document.getElementById('ld-creditor').value=c.name;
  document.getElementById('ld-customer-id').value=c.id||'';
  document.getElementById('ld-nic').value=c.nic||'';
  const brokerSel=document.getElementById('ld-broker');
  if(c.broker&&brokerSel) brokerSel.value=c.broker;
  document.getElementById('ld-creditor-search').value=c.name;
  const badge=document.getElementById('ld-selected-customer');
  const label=document.getElementById('ld-selected-label');
  if(label) label.textContent=c.name+(c.nic?' · '+c.nic:'')+(c.broker?' · '+c.broker:'');
  if(badge) badge.style.display='flex';
  document.getElementById('ld-creditor-dropdown').style.display='none';
  markUnsaved('ld');
}

function ldClearCreditorSelection(){
  document.getElementById('ld-creditor').value='';
  document.getElementById('ld-customer-id').value='';
  document.getElementById('ld-creditor-search').value='';
  document.getElementById('ld-selected-customer').style.display='none';
  document.getElementById('ld-creditor-search').focus();
  markUnsaved('ld');
}

async function saveLoanEdit(){
  if(!window.canDo?.('loans','edit')){showMsg('ld-msg','You do not have permission to edit loans.','err');return;}
  const id=currentLoanId; if(!id) return;
  const capital=parseFloat(document.getElementById('ld-capital').value)||0;
  const rate=parseFloat(document.getElementById('ld-rate')?.value)||8;
  const period=document.getElementById('ld-period')?.value||'monthly';
  const updates={
    creditor_name: document.getElementById('ld-creditor').value.trim(),
    nic_number:    document.getElementById('ld-nic').value.trim()||null,
    broker_name:   document.getElementById('ld-broker').value,
    capital,
    rate_pm:        rate,
    interest_period: period,
    month_invested:document.getElementById('ld-month').value.trim(),
    start_date:    document.getElementById('ld-startdate').value,
    pay_date:      parseInt(document.getElementById('ld-paydate').value)||null,
    status:        document.getElementById('ld-status').value,
  };
  if(!updates.creditor_name||!capital){showMsg('ld-msg','Name and capital are required.','err');return}
  showMsg('ld-msg','Saving…','ok');
  const {error}=await dbFrom('loans').update(updates).eq('id',String(id));
  if(error){showMsg('ld-msg','Error: '+error.message,'err');return}
  showMsg('ld-msg','Saved successfully.','ok');
  {const _u=document.getElementById('ld-unsaved');if(_u)_u.style.display='none';}
  document.getElementById('ld-meta').textContent=`LKR ${fmt(capital)} · ${rate}% ${period} · ${updates.broker_name} · ${updates.status}`;
  await loadAll();
}

async function deleteLoan(){
  if(!window.canDo?.('loans','delete')){showMsg('ld-msg','You do not have permission to delete loans.','err');return;}
  if(!currentLoanId) return;
  if(!confirm('Delete this loan? This cannot be undone.')) return;
  const {error}=await dbFrom('loans').delete().eq('id',String(currentLoanId));
  if(error){alert('Error: '+error.message);return}
  await loadAll();
  navTo('loans');
}




// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  ldCreditorSearch, ldSelectCreditor, ldSelectCreditorAt, ldClearCreditorSelection,
  buildLoansTable, populateBrokerFilter, renderLoansTable, filterLoans,
  handleFile, removeFile,
  creditorSearch, selectCreditorAt, selectCreditor, clearCreditorSelection,
  loanPreview, saveLoan,
  openLoan, saveLoanEdit, deleteLoan,
});
