// ── customers.js ───────────────────────────────────────────────────────────
// Customers list, customer detail, add/edit/delete customer, file handling.
// Reads shared state from window.* (set by loadAll / state.js).
// Uses helpers (fmt, showMsg) from window.*.

import { dbFrom } from '/js/db.js';
import { fmt, fmtK, moActive, sBadge, dBadge, showMsg } from '/js/helpers.js';

let currentCustomerId = null;  // module-scoped state ID, mirrored to window

let cuFiles = { id: null };

// ── CUSTOMERS MANAGEMENT ─────────────────────────────────────────────────────
let allCustomers = []; window.allCustomers = allCustomers;

async function loadCustomers(){
  try{
    const {data,error}=await dbFrom('customers').select('*').order('full_name');
    if(error)throw error;
    allCustomers=data||[]; window.allCustomers = allCustomers;
    filterCustomers();
  }catch(e){
    // customers table may not exist yet — show empty state gracefully
    allCustomers=[]; window.allCustomers = allCustomers;filterCustomers();
  }
}

function filterCustomers(){
  const tbody=document.getElementById('customer-list-tbody');
  if(!tbody)return;
  const q=(document.getElementById('customer-search')?.value||'').toLowerCase();
  const filtered=allCustomers.filter(c=>!q||c.full_name?.toLowerCase().includes(q)||c.nic_number?.toLowerCase().includes(q));
  if(!filtered.length){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">No customers yet.</td></tr>';
    document.getElementById('customer-list-footer').textContent='0 customers';
    return;
  }
  tbody.innerHTML=filtered.map(c=>{
    const loansForC=allLoans.filter(l=>l.nic_number&&l.nic_number===c.nic_number);
    const cid=c.id||'';
    const capital=loansForC.reduce((a,l)=>a+Number(l.capital),0);
    const hasId=!!(c.id_document_url);
    return`<tr style="cursor:pointer" onclick="openCustomer('${cid}')">
      <td style="font-weight:600">${c.full_name}</td>
      <td class="mono" style="color:var(--muted)">${c.nic_number||'—'}</td>
      <td class="mono" style="color:var(--muted)">${c.phone||'—'}</td>
      <td>${c.broker_name||'—'}</td>
      <td class="mono">${loansForC.length}</td>
      <td class="mono">LKR ${fmt(capital)}</td>
      <td><span class="badge ${hasId?'bg':'br'}" title="ID Doc: ${hasId?'Uploaded':'Missing'}">${hasId?'✓':'✗'}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('customer-list-footer').textContent=`${filtered.length} of ${allCustomers.length} customers`;
}

function handleCuFile(type,input){
  const file=input.files[0];if(!file)return;
  if(file.size>5*1024*1024){alert('Max 5MB.');input.value='';return}
  cuFiles[type]=file;
  const icon=file.type.includes('pdf')?'📄':'🖼';
  document.getElementById('cu-preview-'+type).innerHTML=`<div class="file-preview-item"><span class="fp-icon">${icon}</span><span class="fp-name">${file.name}</span><span class="fp-remove" onclick="removeCuFile('${type}')">✕</span></div>`;
}
function removeCuFile(type){cuFiles[type]=null;document.getElementById('cu-id-file').value='';document.getElementById('cu-preview-'+type).innerHTML=''}

async function saveCustomer(){
  if(!window.canDo?.('customers','add')){showMsg('cu-msg','You do not have permission to add customers.','err');return;}
  const name=document.getElementById('cu-name').value.trim();
  const nic=document.getElementById('cu-nic').value.trim();
  const phone=document.getElementById('cu-phone').value.trim();
  const address=document.getElementById('cu-address').value.trim();
  const occupation=document.getElementById('cu-occupation').value.trim();
  const broker=document.getElementById('cu-broker').value;
  const notes=document.getElementById('cu-notes').value.trim();
  if(!name||!nic){showMsg('customer-msg','Full name and NIC are required.','err');return}
  showMsg('customer-msg','Saving…','ok');

  // Upload ID file if present
  let idUrl=null;
  if(cuFiles.id){
    try{
      const path=`customers/${nic}/id_${Date.now()}.${cuFiles.id.name.split('.').pop()}`;
      const {error:ue}=await window.window.sb.storage.from('loan-documents').upload(path,cuFiles.id,{upsert:true});
      if(!ue)idUrl=window.sb.storage.from('loan-documents').getPublicUrl(path).data.publicUrl;
    }catch(e){console.warn('ID upload error:',e)}
  }

  const {error}=await dbFrom('customers').insert([{
    full_name:name,nic_number:nic,phone:phone||null,
    address:address||null,occupation:occupation||null,
    broker_name:broker||null,notes:notes||null,
    id_document_url:idUrl
  }]);
  if(error){showMsg('customer-msg','Error: '+error.message,'err');return}
  showMsg('customer-msg',`Customer "${name}" saved.`,'ok');
  ['cu-name','cu-nic','cu-phone','cu-address','cu-occupation','cu-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('cu-broker').value='';
  removeCuFile('id');
  await loadCustomers();
}


// ── CUSTOMER DETAIL ───────────────────────────────────────────────────────────
function openCustomer(id){
  const c=allCustomers.find(x=>x.id===id||String(x.id)===String(id));
  if(!c) return;
  currentCustomerId=c.id; window.currentCustomerId=currentCustomerId;

  document.getElementById('cd-page-title').textContent='Customer — '+c.full_name;
  document.getElementById('cd-id').textContent='ID: '+c.id;
  document.getElementById('cd-name').textContent=c.full_name;
  document.getElementById('cd-meta').textContent=(c.nic_number||'')+(c.phone?' · '+c.phone:'')+(c.broker_name?' · '+c.broker_name:'');

  document.getElementById('cd-fullname').value=c.full_name||'';
  document.getElementById('cd-nic').value=c.nic_number||'';
  document.getElementById('cd-phone').value=c.phone||'';
  document.getElementById('cd-address').value=c.address||'';
  document.getElementById('cd-occupation').value=c.occupation||'';
  document.getElementById('cd-notes').value=c.notes||'';

  const cdBroker=document.getElementById('cd-broker');
  cdBroker.innerHTML='<option value="">No broker</option>'+allBrokers.map(b=>`<option value="${b.name}" ${b.name===c.broker_name?'selected':''}>${b.name}</option>`).join('');

  // Documents are managed via the Documents page (click Documents button)

  // Loans
  const cLoans=allLoans.filter(l=>l.nic_number&&l.nic_number===c.nic_number);
  document.getElementById('cd-loans-tbody').innerHTML=cLoans.length
    ? cLoans.map(l=>`<tr style="cursor:pointer" onclick="openLoan('${l.id}')">
        <td class="mono" style="color:var(--dim);font-size:10px">${l.id}</td>
        <td class="mono">LKR ${fmt(Number(l.capital))}</td>
        <td class="mono" style="color:var(--muted)">${l.start_date||'—'}</td>
        <td class="mono" style="color:var(--accent)">LKR ${fmt(Number(l.capital)*RATE)}</td>
        <td>${sBadge(l.status)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">No loans</td></tr>';

  {const _u=document.getElementById('cd-unsaved');if(_u)_u.style.display='none';}
  document.getElementById('cd-msg').textContent='';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-customer-detail').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('nav-customers').classList.add('active');
  document.getElementById('page-title').textContent='Customer Detail';
  closeMob(); window.scrollTo(0,0);
}

async function saveCustomerEdit(){
  if(!window.canDo?.('customers','edit')){showMsg('cd-msg','You do not have permission to edit customers.','err');return;}
  const id=currentCustomerId; if(!id) return;
  const updates={
    full_name:   document.getElementById('cd-fullname').value.trim(),
    nic_number:  document.getElementById('cd-nic').value.trim()||null,
    phone:       document.getElementById('cd-phone').value.trim()||null,
    address:     document.getElementById('cd-address').value.trim()||null,
    occupation:  document.getElementById('cd-occupation').value.trim()||null,
    broker_name: document.getElementById('cd-broker').value||null,
    notes:       document.getElementById('cd-notes').value.trim()||null,
  };
  if(!updates.full_name){showMsg('cd-msg','Name is required.','err');return}
  showMsg('cd-msg','Saving…','ok');
  const {error}=await dbFrom('customers').update(updates).eq('id',id);
  if(error){showMsg('cd-msg','Error: '+error.message,'err');return}
  showMsg('cd-msg','Saved.','ok');
  {const _u=document.getElementById('cd-unsaved');if(_u)_u.style.display='none';}
  await loadCustomers();
}

async function uploadCustomerDoc(customerId, input){
  const file=input.files[0]; if(!file) return;
  if(file.size>5*1024*1024){alert('Max 5MB.');return}
  const ext=file.name.split('.').pop().toLowerCase();
  const path='customers/'+customerId+'/id_'+Date.now()+'.'+ext;
  const {error:ue}=await window.window.sb.storage.from('loan-documents').upload(path,file,{upsert:true});
  if(ue){alert('Upload error: '+ue.message+'. Make sure the "loan-documents" bucket exists in Supabase Storage.');return}
  const url=window.sb.storage.from('loan-documents').getPublicUrl(path).data.publicUrl;
  await dbFrom('customers').update({id_document_url:url}).eq('id',customerId);
  await loadCustomers();
  openCustomer(customerId);
}

async function deleteCustomer(){
  if(!window.canDo?.('customers','delete')){showMsg('cd-msg','You do not have permission to delete customers.','err');return;}
  if(!currentCustomerId) return;
  if(!confirm('Delete this customer? This cannot be undone.')) return;
  const {error}=await dbFrom('customers').delete().eq('id',currentCustomerId);
  if(error){alert('Error: '+error.message);return}
  await loadCustomers();
  navTo('add-customer');
}


// ── CUSTOMERS PAGE (Tools section) ───────────────────────────────────────────
function renderCustomersPage(){
  const q=(document.getElementById('cust-page-search')?.value||'').toLowerCase();
  const bFilter=document.getElementById('cust-page-broker-filter')?.value||'';

  // Populate broker filter dropdown
  const bfSel=document.getElementById('cust-page-broker-filter');
  if(bfSel&&bfSel.options.length<=1){
    const bs=[...new Set(allCustomers.map(c=>c.broker_name).filter(Boolean))].sort();
    bfSel.innerHTML='<option value="">All brokers</option>'+bs.map(b=>`<option>${b}</option>`).join('');
  }

  const filtered=allCustomers.filter(c=>
    (!q||c.full_name?.toLowerCase().includes(q)||c.nic_number?.toLowerCase().includes(q)||c.phone?.toLowerCase().includes(q))&&
    (!bFilter||c.broker_name===bFilter)
  );

  const tbody=document.getElementById('customers-page-tbody');
  if(!tbody) return;

  if(!filtered.length){
    tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;font-size:12px">
      No customers found. <span style="color:var(--accent);cursor:pointer" onclick="navTo('add-customer')">Add a customer →</span>
    </td></tr>`;
    if(document.getElementById('customers-page-footer'))
      document.getElementById('customers-page-footer').textContent='0 customers';
    if(document.getElementById('customers-count-badge'))
      document.getElementById('customers-count-badge').textContent='0';
    return;
  }

  tbody.innerHTML=filtered.map(c=>{
    const cLoans=allLoans.filter(l=>l.nic_number&&l.nic_number===c.nic_number);
    const totalCap=cLoans.reduce((a,l)=>a+Number(l.capital),0);
    const hasId=!!c.id_document_url;
    const cid=c.id||'';
    return`<tr style="cursor:pointer" onclick="openCustomer('${cid}')">
      <td style="font-weight:600">${c.full_name}</td>
      <td class="mono" style="color:var(--muted)">${c.nic_number||'—'}</td>
      <td class="mono" style="color:var(--muted)">${c.phone||'—'}</td>
      <td>${c.broker_name||'—'}</td>
      <td style="color:var(--muted);font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.address||'—'}</td>
      <td class="mono">${cLoans.length}</td>
      <td class="mono">LKR ${fmt(totalCap)}</td>
      <td><span class="badge ${hasId?'bg':'br'}" title="ID: ${hasId?'Uploaded':'Missing'}">${hasId?'✓ ID':'✗ ID'}</span></td>
    </tr>`;
  }).join('');

  const footer=document.getElementById('customers-page-footer');
  if(footer) footer.textContent=`${filtered.length} of ${allCustomers.length} customers`;
  const badge=document.getElementById('customers-count-badge');
  if(badge) badge.textContent=filtered.length;
}

// ── DOCUMENT PAGE ────────────────────────────────────────────────────────────

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  loadCustomers, filterCustomers, handleCuFile, removeCuFile, saveCustomer,
  openCustomer, saveCustomerEdit, uploadCustomerDoc, deleteCustomer,
  renderCustomersPage,
});
