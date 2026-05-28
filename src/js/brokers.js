// ── brokers.js ─────────────────────────────────────────────────────────────
// Brokers list, broker chart, broker detail, add/edit/delete.
// Reads shared state from window.* (set by loadAll / state.js).
// Uses helpers (fmt, sBadge, showMsg) from window.*.

import { dbFrom } from '/js/db.js';
import { fmt, fmtK, moActive, sBadge, dBadge, showMsg } from '/js/helpers.js';

let currentBrokerId = null;  // module-scoped state ID, mirrored to window

let brokerIncChart = null;  // Chart.js instance for broker income chart

// Provide local state references — refreshed from window before each operation
let allBrokers = [], allLoans = [], allPayments = [];
function _refreshState() {
  allBrokers = window.allBrokers || [];
  allLoans = window.allLoans || [];
  allPayments = window.allPayments || [];
}

// ── BROKERS ───────────────────────────────────────────────────────────────────
function renderBrokers(){
  _refreshState();
  // Build stats from loans
  const bm={};allLoans.forEach(l=>{if(!bm[l.broker_name])bm[l.broker_name]={count:0,capital:0,activeCapital:0};bm[l.broker_name].count++;bm[l.broker_name].capital+=Number(l.capital);if(l.status==='Lending')bm[l.broker_name].activeCapital+=Number(l.capital)});
  const sorted=Object.entries(bm).sort((a,b)=>b[1].capital-a[1].capital);
  document.getElementById('broker-tbody').innerHTML=sorted.map(([b,v])=>{
    // Find broker record for ID — needed to open detail page
    const brokerRec=allBrokers.find(x=>x.name===b);
    const bid=brokerRec?brokerRec.id:'';
    const clickAttr=bid?`style="cursor:pointer" onclick="openBroker('${bid}')"`:'' ;
    return`<tr ${clickAttr}><td style="font-weight:600">${b}</td><td class="mono">${v.count}</td><td class="mono">LKR ${fmt(v.capital)}</td><td class="mono">LKR ${fmt(v.activeCapital)}</td><td class="mono" style="color:var(--accent)">LKR ${fmt(v.activeCapital*RATE)}/mo</td><td class="mono" style="color:var(--muted)">LKR ${fmt(v.capital/v.count)}</td></tr>`;
  }).join('');
  if(brokerIncChart)brokerIncChart.destroy();
  const cols=['#FFC107','#4ade80','#60a5fa','#fbbf24'];
  brokerIncChart=new Chart(document.getElementById('broker-income-chart'),{type:'bar',data:{labels:sorted.map(([b])=>b),datasets:[{data:sorted.map(([,v])=>Math.round(v.activeCapital*RATE)),backgroundColor:sorted.map((_,i)=>cols[i%4]),borderRadius:4}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'LKR '+Math.round(c.raw).toLocaleString()+'/mo'}}},scales:{y:{ticks:{callback:v=>'LKR '+v.toLocaleString(),color:'#7a8a7a',font:{size:9}},grid:{color:'rgba(255,255,255,.04)'},border:{display:false}},x:{ticks:{color:'#7a8a7a',font:{size:10}},grid:{display:false}}}}});
}


// ── BROKERS MANAGEMENT ───────────────────────────────────────────────────────
async function loadBrokers(){
  try{
    const {data,error}=await dbFrom('brokers').select('*').order('name');
    if(error)throw error;
    window.allBrokers = data || []; allBrokers = window.allBrokers;
    // Populate broker dropdowns everywhere
    const brokerOpts=allBrokers.map(b=>`<option value="${b.name}">${b.name}</option>`).join('');
    const selects=['f-broker','cu-broker'];
    selects.forEach(id=>{
      const el=document.getElementById(id);
      if(el){const cur=el.value;el.innerHTML='<option value="">Select broker</option>'+brokerOpts;el.value=cur;}
    });
    renderBrokerList();
  }catch(e){console.warn('Broker load error:',e)}
}

function renderBrokerList(){
  _refreshState();
  const tbody=document.getElementById('broker-list-tbody');
  if(!tbody)return;
  if(!allBrokers.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">No brokers yet.</td></tr>';return}
  tbody.innerHTML=allBrokers.map(b=>{
    const loansForBroker=allLoans.filter(l=>l.broker_name===b.name);
    const capital=loansForBroker.reduce((a,l)=>a+Number(l.capital),0);
    const statusCls=b.status==='Active'?'bg':'bd';
    return`<tr style="cursor:pointer" onclick="openBroker('${b.id}')">
      <td style="font-weight:600">${b.name}</td>
      <td class="mono" style="color:var(--muted)">${b.phone||'—'}</td>
      <td class="mono" style="color:var(--muted)">${b.nic_number||'—'}</td>
      <td class="mono" style="color:var(--accent)">${b.commission_rate?b.commission_rate+'%':'—'}</td>
      <td class="mono">${loansForBroker.length}</td>
      <td class="mono">LKR ${fmt(capital)}</td>
      <td><span class="badge ${statusCls}">${b.status||'Active'}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('broker-list-footer').textContent=`${allBrokers.length} broker${allBrokers.length!==1?'s':''}`;
}

async function saveBroker(){
  if(!window.canDo?.('brokers','add')){showMsg('br-msg','You do not have permission to add brokers.','err');return;}
  const name=document.getElementById('br-name').value.trim();
  const phone=document.getElementById('br-phone').value.trim();
  const nic=document.getElementById('br-nic').value.trim();
  const email=document.getElementById('br-email').value.trim();
  const commission=parseFloat(document.getElementById('br-commission').value)||null;
  const status=document.getElementById('br-status').value;
  const notes=document.getElementById('br-notes').value.trim();
  if(!name){showMsg('broker-msg','Broker name is required.','err');return}
  showMsg('broker-msg','Saving…','ok');
  const {error}=await dbFrom('brokers').insert([{
    name,phone:phone||null,nic_number:nic||null,
    email:email||null,commission_rate:commission,
    status,notes:notes||null
  }]);
  if(error){showMsg('broker-msg','Error: '+error.message,'err');return}
  showMsg('broker-msg',`Broker "${name}" saved successfully.`,'ok');
  ['br-name','br-phone','br-nic','br-email','br-commission','br-notes'].forEach(id=>document.getElementById(id).value='');
  await loadBrokers();
  renderBrokerList();
}


// ── BROKER DETAIL ─────────────────────────────────────────────────────────────
function openBroker(id){
  _refreshState();
  const b=allBrokers.find(x=>x.id===id||String(x.id)===String(id));
  if(!b) return;
  currentBrokerId=b.id; window.currentBrokerId=currentBrokerId;

  document.getElementById('bd-page-title').textContent='Broker — '+b.name;
  document.getElementById('bd-id').textContent='ID: '+b.id;
  document.getElementById('bd-name').textContent=b.name;
  document.getElementById('bd-meta').textContent=(b.phone||'')+(b.email?' · '+b.email:'')+(b.status?' · '+b.status:'');

  document.getElementById('bd-fullname').value=b.name||'';
  document.getElementById('bd-phone').value=b.phone||'';
  document.getElementById('bd-nic').value=b.nic_number||'';
  document.getElementById('bd-email').value=b.email||'';
  document.getElementById('bd-commission').value=b.commission_rate||'';
  document.getElementById('bd-status').value=b.status||'Active';
  document.getElementById('bd-notes').value=b.notes||'';

  // Loans by this broker
  const bLoans=allLoans.filter(l=>l.broker_name===b.name);
  const totalCap=bLoans.reduce((a,l)=>a+Number(l.capital),0);
  document.getElementById('bd-loans-tbody').innerHTML=bLoans.length
    ? bLoans.map(l=>`<tr style="cursor:pointer" onclick="openLoan('${l.id}')">
        <td class="mono" style="color:var(--dim);font-size:10px">${l.id}</td>
        <td style="font-weight:600">${l.creditor_name}</td>
        <td class="mono">LKR ${fmt(Number(l.capital))}</td>
        <td class="mono" style="color:var(--muted)">${l.start_date||'—'}</td>
        <td class="mono" style="color:var(--accent)">LKR ${fmt(Number(l.capital)*RATE)}</td>
        <td>${sBadge(l.status)}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:16px">No loans</td></tr>';
  document.getElementById('bd-loans-footer').textContent=`${bLoans.length} loans · Total capital: LKR ${fmt(totalCap)}`;

  {const _u=document.getElementById('bd-unsaved');if(_u)_u.style.display='none';}
  document.getElementById('bd-msg').textContent='';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-broker-detail').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('nav-add-broker').classList.add('active');
  document.getElementById('page-title').textContent='Broker Detail';
  closeMob(); window.scrollTo(0,0);
}

async function saveBrokerEdit(){
  if(!window.canDo?.('brokers','edit')){showMsg('bd-msg','You do not have permission to edit brokers.','err');return;}
  const id=currentBrokerId; if(!id) return;
  const updates={
    name:            document.getElementById('bd-fullname').value.trim(),
    phone:           document.getElementById('bd-phone').value.trim()||null,
    nic_number:      document.getElementById('bd-nic').value.trim()||null,
    email:           document.getElementById('bd-email').value.trim()||null,
    commission_rate: parseFloat(document.getElementById('bd-commission').value)||null,
    status:          document.getElementById('bd-status').value,
    notes:           document.getElementById('bd-notes').value.trim()||null,
  };
  if(!updates.name){showMsg('bd-msg','Name is required.','err');return}
  showMsg('bd-msg','Saving…','ok');
  const {error}=await dbFrom('brokers').update(updates).eq('id',id);
  if(error){showMsg('bd-msg','Error: '+error.message,'err');return}
  showMsg('bd-msg','Saved.','ok');
  {const _u=document.getElementById('bd-unsaved');if(_u)_u.style.display='none';}
  await loadBrokers();
}

async function deleteBroker(){
  if(!window.canDo?.('brokers','delete')){showMsg('bd-msg','You do not have permission to delete brokers.','err');return;}
  if(!currentBrokerId) return;
  if(!confirm('Delete this broker? Existing loans will keep the broker name but it will be removed from dropdowns.')) return;
  const {error}=await dbFrom('brokers').delete().eq('id',currentBrokerId);
  if(error){alert('Error: '+error.message);return}
  await loadBrokers();
  navTo('add-broker');
}


// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  renderBrokers, loadBrokers, renderBrokerList, saveBroker,
  openBroker, saveBrokerEdit, deleteBroker,
});
