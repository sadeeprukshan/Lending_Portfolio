// ── documents.js ───────────────────────────────────────────────────────────
// Document vault: per loan/customer/broker/payment.
// Card helpers, upload, viewer, list, delete.
// Reads window.allLoans, allCustomers, allBrokers, allPayments at call time.

import { dbFrom } from '/js/db.js';
import { fmt, showMsg } from '/js/helpers.js';

// Module state — populated/refreshed from window
let docCache = {};
let currentDocHolder = null;
let currentDocViewer = null;
let allLoans = [], allCustomers = [], allBrokers = [], allPayments = [];

function _refreshState() {
  allLoans = window.allLoans || [];
  allCustomers = window.allCustomers || [];
  allBrokers = window.allBrokers || [];
  allPayments = window.allPayments || [];
}

// ── DOCUMENT CARD HELPER ──────────────────────────────────────────────────────
function docCardHtml(doc, parentType, parentId){
  // Safe IDs — sanitise parentId to only alphanumeric for use in element IDs
  const safeId=String(parentId).replace(/[^a-zA-Z0-9]/g,'');
  const inputId='doc-upload-'+doc.key+'-'+safeId;

  if(!doc.url){
    // No URL — show upload area (whether has flag is true or false)
    return`<div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${doc.label}${doc.required?' <span style=\"color:var(--amber)\">required</span>':''}</div>
      <div class="doc-upload-area" onclick="document.getElementById('${inputId}').click()">
        <input type="file" id="${inputId}" accept=".pdf,.png,.jpg,.jpeg"
          onchange="uploadDoc('${parentType}','${doc.key}','${parentId}',this)">
        <label class="doc-upload-label" for="${inputId}"><strong>Click to upload</strong><br>PDF, PNG, JPG · Max 5MB</label>
      </div>
    </div>`;
  }

  // Has URL — show doc card with view + download
  const rawExt=(doc.url.split('?')[0].split('.').pop()||'').toUpperCase().substring(0,4);
  const ext=rawExt||'FILE';
  const icon=ext==='PDF'?'📄':'🖼';

  return`<div>
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${doc.label}</div>
    <div class="doc-card">
      <div class="doc-card-left">
        <span class="doc-card-icon">${icon}</span>
        <div>
          <div class="doc-card-name">${doc.label}</div>
          <div class="doc-card-type">${ext} document</div>
        </div>
      </div>
      <div class="doc-card-actions">
        <a href="${doc.url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size:11px">👁 View</a>
        <a href="${doc.url}" download="${doc.label.replace(/\s+/g,'_')}.${ext.toLowerCase()}" class="btn btn-ghost btn-sm" style="font-size:11px">↓ Save</a>
        <span class="btn btn-ghost btn-sm" style="font-size:11px;cursor:pointer;color:var(--muted)"
          onclick="replaceDoc('${parentType}','${doc.key}','${parentId}','${inputId}')">↺ Replace</span>
        <input type="file" id="${inputId}" accept=".pdf,.png,.jpg,.jpeg" style="display:none"
          onchange="uploadDoc('${parentType}','${doc.key}','${parentId}',this)">
      </div>
    </div>
  </div>`;
}

function replaceDoc(parentType, docKey, parentId, inputId){
  const el=document.getElementById(inputId);
  if(el) el.click();
}

async function uploadDoc(parentType, docKey, parentId, input){
  // Redirect to the new docPageUpload which has bucket checking
  const colMap={promissory:'promissory_document_url',id_doc:'id_document_url',mortgage:'mortgage_document_url'};
  const hasColMap={promissory:'has_promissory',mortgage:'has_mortgage'};
  const urlCol=colMap[docKey]||docKey+'_url';
  const hasCol=hasColMap[docKey]||'';
  await docPageUpload(parentType, parentId, docKey, urlCol, hasCol, input);
  if(parentType==='loan') openLoan(parentId);
  if(parentType==='customer') openCustomer(parentId);
}

// customers page imported from /js/customers.js

// ── DOCUMENT PAGE ────────────────────────────────────────────────────────────
// State
let docPageParentType = null;   // 'loan' or 'customer'
let docPageParentId   = null;
let docPageBackTarget = 'loans';

// Document holder definitions — multiple files allowed per holder
// Each holder maps to a 'holder' value in the loan_documents table
const DOC_TYPES = {
  loan: [
    {key:'promissory', label:'Promissory note',   icon:'📝', legacy_col:'promissory_document_url', legacy_has:'has_promissory'},
    {key:'id_copy',    label:'ID copy',            icon:'🪪', legacy_col:'id_document_url',         legacy_has:null},
    {key:'mortgage',   label:'Mortgage document',  icon:'🏠', legacy_col:'mortgage_document_url',   legacy_has:'has_mortgage'},
    {key:'transfers',  label:'Transfers',           icon:'💳', legacy_col:null,                      legacy_has:null},
    {key:'other',      label:'Other documents',     icon:'📂', legacy_col:null,                      legacy_has:null},
  ],
  customer: [
    {key:'id_copy',    label:'ID / NIC copy',      icon:'🪪', legacy_col:'id_document_url',         legacy_has:null},
    {key:'transfers',  label:'Transfers',           icon:'💳', legacy_col:null,                      legacy_has:null},
    {key:'other',      label:'Other documents',     icon:'📂', legacy_col:null,                      legacy_has:null},
  ]
};

// In-memory cache: { 'loan:123': [{id,holder,file_name,file_url,file_ext,uploaded_at},...] }
// docCache declared at top of module


async function loadDocsForRecord(parentType, parentId) {
  const key = parentType+':'+parentId;
  try {
    const {data, error} = await dbFrom('loan_documents')
      .select('*')
      .eq('parent_type', parentType)
      .eq('parent_id', String(parentId))
      .order('uploaded_at', {ascending:true});
    if(error) throw error;
    docCache[key] = data || [];
  } catch(e) {
    // Table may not exist yet — fall back to legacy columns
    docCache[key] = [];
    console.warn('loan_documents table not found. Run create_loan_documents_table.sql first.', e.message);
  }
}

function getDocsForHolder(parentType, parentId, holderKey) {
  const key = parentType+':'+parentId;
  return (docCache[key]||[]).filter(d=>d.holder===holderKey);
}

// Merge legacy single-URL docs into the display list (read-only, not in new table)
function getLegacyDoc(record, holderDef) {
  if(!holderDef.legacy_col || !record) return null;
  const url = record[holderDef.legacy_col];
  if(!url) return null;
  const rawExt = (url.split('?')[0].split('.').pop()||'').toUpperCase().slice(0,4);
  return {id:'legacy', holder:holderDef.key, file_name:holderDef.label, file_url:url, file_ext:rawExt||'FILE', uploaded_at:null, legacy:true};
}

async function openDocPage(parentType, parentId) {
  _refreshState();
  if(!parentId){alert('Please save the record first.');return;}
  docPageParentType = parentType;
  docPageParentId   = parentId;
  docPageBackTarget = parentType==='loan' ? 'loan-detail' : 'customer-detail';

  // Navigate first so user sees the page immediately
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-documents').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-title').textContent='Documents';
  closeMob(); window.scrollTo(0,0);

  // Set title
  const titleLabel = parentType==='loan' ? 'Loan '+parentId : 'Customer';
  document.getElementById('docp-title').textContent = 'Documents — '+titleLabel;

  // Build upload strip
  buildUploadStrip(parentType, parentId);

  // Clear viewer and show loading state
  clearDocViewer();
  document.getElementById('docp-list').innerHTML='<div class="doc-list-empty">Loading…</div>';

  // Load docs from table then render
  await loadDocsForRecord(parentType, parentId);
  renderDocList(parentType, parentId);
}

function docPageBack() {
  if(docPageBackTarget==='loan-detail' && currentLoanId) {
    openLoan(currentLoanId);
  } else if(docPageBackTarget==='customer-detail' && currentCustomerId) {
    openCustomer(currentCustomerId);
  } else {
    navTo('loans');
  }
}

function buildUploadStrip(parentType, parentId) {
  const types = DOC_TYPES[parentType] || [];
  const strip = document.getElementById('docp-upload-row');
  // Each holder gets its own upload button — multiple files accepted per holder
  strip.innerHTML = types.map(t => {
    const inputId = 'docp-file-'+t.key;
    return `<label class="doc-upload-btn-wrap" title="Upload to: ${t.label}">
      <input type="file" id="${inputId}" accept=".pdf,.png,.jpg,.jpeg" multiple
        onchange="docPageUpload('${parentType}','${parentId}','${t.key}',this)">
      <span style="font-size:15px">${t.icon}</span>
      <span>+ ${t.label}</span>
    </label>`;
  }).join('');
}

function renderDocList(parentType, parentId) {
  _refreshState();
  const list = document.getElementById('docp-list');
  const types = DOC_TYPES[parentType] || [];

  // Get the current record (for legacy column fallback)
  let record = null;
  if(parentType==='loan')     record = allLoans.find(l=>String(l.id)===String(parentId));
  if(parentType==='customer') record = allCustomers.find(c=>String(c.id)===String(parentId));

  // Build full doc list: new table rows + legacy single-URL docs
  let allItems = []; // {rowId, holder, holderLabel, holderIcon, file_name, file_url, file_ext, isLegacy}
  let globalIdx = 0;

  types.forEach(t => {
    // New table docs for this holder
    const newDocs = getDocsForHolder(parentType, parentId, t.key);
    newDocs.forEach(d => {
      const ext = (d.file_ext||'').toUpperCase().slice(0,4)||'FILE';
      allItems.push({rowId:d.id, holder:t.key, holderLabel:t.label, holderIcon:t.icon,
        file_name:d.file_name, file_url:d.file_url, file_ext:ext, isLegacy:false, idx:globalIdx++});
    });
    // Legacy single-URL doc (read-only migration path)
    const legacyDoc = getLegacyDoc(record, t);
    if(legacyDoc && !newDocs.length) { // only show legacy if no new docs for this holder
      const ext = legacyDoc.file_ext||'FILE';
      allItems.push({rowId:'legacy_'+t.key, holder:t.key, holderLabel:t.label, holderIcon:t.icon,
        file_name:t.label, file_url:legacyDoc.file_url, file_ext:ext, isLegacy:true, idx:globalIdx++});
    }
  });

  if(!allItems.length){
    list.innerHTML='<div class="doc-list-empty">No documents attached yet.<br>Use the upload buttons above.</div>';
    return;
  }

  // Group by holder
  const grouped = {};
  types.forEach(t => { grouped[t.key] = {label:t.label, icon:t.icon, items:[]}; });
  allItems.forEach(item => { if(grouped[item.holder]) grouped[item.holder].items.push(item); });

  let html2 = '';
  types.forEach(t => {
    const group = grouped[t.key];
    if(!group || !group.items.length) return;
    // Holder group header
    html2 += `<div style="padding:6px 14px 2px;font-family:monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;background:var(--bg);display:flex;align-items:center;gap:5px">
      <span>${t.icon}</span><span>${t.label}</span>
      <span style="margin-left:auto;color:var(--dim)">${group.items.length} file${group.items.length!==1?'s':''}</span>
    </div>`;
    group.items.forEach(item => {
      const fileIcon = item.file_ext==='PDF' ? '&#128196;' : '&#128247;';
      const dateStr = item.isLegacy ? '(legacy)' : '';
      html2 += `<div class="doc-list-item" id="dli-${item.idx}"
        onclick="docViewerOpen(${item.idx},'${item.file_url}','${item.file_name}','${item.file_ext}')">
        <span class="dli-icon">${fileIcon}</span>
        <div class="dli-info">
          <div class="dli-name" style="font-size:11px">${item.file_name}</div>
          <div class="dli-meta">${item.file_ext} ${dateStr}</div>
        </div>
        ${!item.isLegacy
          ? `<span class="dli-del" onclick="event.stopPropagation();docDeleteRow('${item.rowId}','${parentType}','${parentId}')" title="Delete">&#10005;</span>`
          : `<span style="font-size:9px;color:var(--dim);padding:2px 5px">legacy</span>`}
      </div>`;
    });
  });

  list.innerHTML = html2;
}

function docViewerOpen(idx, url, label, ext) {
  // Highlight active item
  document.querySelectorAll('.doc-list-item').forEach((el,i)=>{
    el.classList.toggle('dli-active', i===idx);
  });

  document.getElementById('docp-viewer-name').textContent = label;

  // Set open + download buttons
  const openBtn = document.getElementById('docp-open-btn');
  const dlBtn   = document.getElementById('docp-dl-btn');
  openBtn.href  = url;
  dlBtn.href    = url;
  dlBtn.download = label.replace(/\s+/g,'_')+'.'+ext.toLowerCase();
  openBtn.style.display = 'inline-flex';
  dlBtn.style.display   = 'inline-flex';

  // Render in viewer
  const body = document.getElementById('docp-viewer-body');
  if(ext==='PDF'){
    // Use Google Docs viewer as fallback for cross-origin PDFs
    body.innerHTML = `<iframe src="${url}" title="${label}"></iframe>`;
  } else {
    body.innerHTML = `<img src="${url}" alt="${label}" onerror="this.parentElement.innerHTML='<div class=\'doc-viewer-placeholder\'>Cannot preview this file.<br>Use the Open or Download button above.</div>'">`;
  }
}

function clearDocViewer(){
  document.getElementById('docp-viewer-name').textContent = 'Select a document';
  document.getElementById('docp-viewer-body').innerHTML = '<div class="doc-viewer-placeholder">Click a document on the left<br>to preview it here</div>';
  const ob=document.getElementById('docp-open-btn');
  const db=document.getElementById('docp-dl-btn');
  if(ob)ob.style.display='none';
  if(db)db.style.display='none';
}

async function docPageUpload(parentType, parentId, holderKey, input) {
  if(!window.canDo?.('documents','add')){showMsg('doc-msg','You do not have permission to upload documents.','err');return;}
  _refreshState();
  const files = Array.from(input.files||[]);
  if(!files.length) return;

  const BUCKET = 'loan-documents';
  const folder = parentType==='loan' ? 'loans' : 'customers';
  let uploadedCount = 0;
  let errors = [];

  for(const file of files){
    if(file.size > 5*1024*1024){ errors.push(file.name+': too large (max 5MB)'); continue; }

    const ext  = file.name.split('.').pop().toLowerCase();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = folder+'/'+String(parentId)+'/'+holderKey+'_'+Date.now()+'_'+safeName;

    showMsg('docp-upload-msg','Uploading '+file.name+'…','ok');

    const {error: ue} = await window.window.sb.storage.from(BUCKET).upload(path, file, {upsert:true});
    if(ue){
      const msg = ue.message||'';
      if(msg.toLowerCase().includes('bucket')||msg.toLowerCase().includes('not found')){
        errors.push('Bucket "loan-documents" not found — create it in Supabase → Storage');
      } else if(msg.toLowerCase().includes('policy')||msg.toLowerCase().includes('permission')){
        errors.push('Permission denied — run fix_storage_policies.sql in Supabase SQL Editor');
      } else {
        errors.push(file.name+': '+msg);
      }
      continue;
    }

    const publicUrl = window.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // Insert row into loan_documents table
    const {error: dbErr} = await dbFrom('loan_documents').insert([{
      parent_type: parentType,
      parent_id:   String(parentId),
      holder:      holderKey,
      file_name:   file.name,
      file_url:    publicUrl,
      file_ext:    ext,
    }]);

    if(dbErr){ errors.push(file.name+' (DB): '+dbErr.message); continue; }
    uploadedCount++;
  }

  input.value='';

  if(errors.length){
    showMsg('docp-upload-msg', errors.join(' | '),'err');
  } else {
    showMsg('docp-upload-msg', uploadedCount+' file'+( uploadedCount!==1?'s':'')+' uploaded successfully.','ok');
  }

  // Reload docs and re-render
  await loadDocsForRecord(parentType, parentId);
  renderDocList(parentType, parentId);
  clearDocViewer();
}

async function docDeleteRow(rowId, parentType, parentId){
  if(!window.canDo?.('documents','delete')){alert('You do not have permission to delete documents.');return;}
  _refreshState();
  if(!confirm('Delete this file from the record?')) return;
  const {error} = await dbFrom('loan_documents').delete().eq('id', rowId);
  if(error){alert('Error: '+error.message);return;}
  await loadDocsForRecord(parentType, parentId);
  renderDocList(parentType, parentId);
  clearDocViewer();
}

async function docDeleteConfirm(parentType, parentId, urlCol, hasCol, label) {
  if(!window.canDo?.('documents','delete')){alert('You do not have permission to delete documents.');return;}
  _refreshState();
  // Legacy stub — kept for backward compatibility
  if(!confirm('Remove "'+label+'"?')) return;
  const update = {[urlCol]: null};
  if(hasCol) update[hasCol] = false;
  let err = null;
  if(parentType==='loan')     err=(await dbFrom('loans').update(update).eq('id',String(parentId))).error;
  if(parentType==='customer') err=(await dbFrom('customers').update(update).eq('id',parentId)).error;
  if(err){alert('Error: '+err.message);return;}
  await loadAll();
  await loadDocsForRecord(parentType, parentId);
  renderDocList(parentType, parentId);
  clearDocViewer();
}


// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  docCardHtml, replaceDoc, uploadDoc, loadDocsForRecord, getDocsForHolder,
  getLegacyDoc, openDocPage, docPageBack, renderDocList, docViewerOpen,
  clearDocViewer, docPageUpload, docDeleteRow, docDeleteConfirm,
});
