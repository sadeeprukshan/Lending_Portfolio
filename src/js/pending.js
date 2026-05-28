// ── pending.js ─────────────────────────────────────────────────────────────
// Pending requests admin page: list company registrations, approve/reject/suspend.
// Reads window.sb directly (registrations table is public, not tenant-scoped).
// Uses helpers (fmt, showMsg) from window.* via imports.

import { fmt, showMsg } from '/js/helpers.js';
import { ADMIN_EMAIL } from '/js/config.js';

// Module state — refreshed from DB on each loadPendingRequests
let allRegistrations = [];
let currentPRId = null;  // ID of registration currently shown in drawer

// ── PENDING REQUESTS ─────────────────────────────────────────────────────────
// allRegistrations declared at top of module
let prActiveTab = 'pending';

async function loadPendingRequests(){
  const tbody = document.getElementById('pr-tbody');
  if(tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:20px;font-size:12px">Loading…</td></tr>';

  try{
    // Read from the standalone registrations table (always public schema)
    // window.sb.from() directly — never dbFrom() which routes to tenant schema
    const {data, error} = await window.sb
      .from('registrations')
      .select('*')
      .order('submitted_at', {ascending:false});

    if(error) throw error;
    allRegistrations = data || [];

  }catch(e){
    const msg = e.message||'Unknown error';
    const hint = msg.includes('does not exist') || msg.includes('relation')
      ? ' — Run create_registrations_table.sql in Supabase SQL Editor first.'
      : '';
    if(tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--red);padding:20px;font-size:12px">Error: ${msg}${hint}</td></tr>`;
    return;
  }

  renderPRSummary();
  renderPRTable(prActiveTab);
}

function renderPRSummary(){
  const strip = document.getElementById('pr-summary-strip');
  if(!strip) return;
  const total    = allRegistrations.length;
  const pending  = allRegistrations.filter(c=>c.status==='pending').length;
  const approved = allRegistrations.filter(c=>c.status==='approved').length;
  const rejected = allRegistrations.filter(c=>c.status==='rejected').length;

  // Update badge
  const badge = document.getElementById('pending-count-badge');
  if(badge) badge.textContent = pending > 0 ? pending : '';

  strip.innerHTML = [
    {l:'Total',    v:total,    c:'var(--text)'},
    {l:'Pending',  v:pending,  c:'var(--amber)'},
    {l:'Approved', v:approved, c:'var(--accent)'},
    {l:'Rejected', v:rejected, c:'var(--red)'},
  ].map(s=>`<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px 16px">
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${s.l}</div>
    <div style="font-size:22px;font-weight:700;color:${s.c};letter-spacing:-1px">${s.v}</div>
  </div>`).join('');
}

function setPRTab(tab){
  prActiveTab = tab;
  document.querySelectorAll('.pr-tab').forEach(el=>{
    el.classList.remove('pr-tab-active');
  });
  const el = document.getElementById('pr-tab-'+tab);
  if(el) el.classList.add('pr-tab-active');
  renderPRTable(tab);
}

function renderPRTable(tab){
  const tbody = document.getElementById('pr-tbody');
  if(!tbody) return;

  const filtered = tab==='all'
    ? allRegistrations
    : allRegistrations.filter(c=>c.status===tab);

  if(!filtered.length){
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px;font-size:12px">No ${tab==='all'?'':tab} registrations.</td></tr>`;
    document.getElementById('pr-footer').textContent = '';
    return;
  }

  const statusStyles = {
    pending:  {bg:'var(--amber-bg)', color:'var(--amber)'},
    approved: {bg:'var(--green-bg)', color:'var(--accent)'},
    rejected: {bg:'var(--red-bg)',   color:'var(--red)'},
    suspended:{bg:'var(--blue-bg)',  color:'var(--blue)'},
  };

  tbody.innerHTML = filtered.map(c=>{
    const s = statusStyles[c.status] || statusStyles.pending;
    const reg = c.submitted_at ? new Date(c.submitted_at).toLocaleDateString('en-LK',{day:'numeric',month:'short',year:'2-digit'}) : '—';
    return `<tr style="cursor:pointer" onclick="openPRDrawer('${c.id}')">
      <td>
        <div style="font-weight:600">${c.company_name||'—'}</div>
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);margin-top:2px">${c.schema_name||'—'}</div>
      </td>
      <td class="mono" style="color:var(--muted);font-size:12px">${c.email||'—'}</td>
      <td style="color:var(--muted);font-size:12px">${c.business_type||'—'}</td>
      <td class="mono" style="color:var(--muted);font-size:12px">${c.phone||'—'}</td>
      <td style="color:var(--muted);font-size:12px">${c.country||'—'}</td>
      <td class="mono" style="color:var(--muted);font-size:11px">${c.num_employees||'—'}</td>
      <td class="mono" style="color:var(--dim);font-size:11px">${reg}</td>
      <td><span class="badge" style="background:${s.bg};color:${s.color}">${c.status}</span></td>
      <td><button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="event.stopPropagation();openPRDrawer('${c.id}')">Review →</button></td>
    </tr>`;
  }).join('');

  document.getElementById('pr-footer').textContent = `${filtered.length} registration${filtered.length!==1?'s':''}`;
}

function openPRDrawer(id){
  const c = allRegistrations.find(x=>x.id===id);
  if(!c) return;

  document.getElementById('pr-drawer-title').textContent = c.company_name||'Company';

  const fields = [
    ['Company name',   c.company_name],
    ['Status',         c.status],
    ['Email',          c.email],
    ['Phone',          c.phone],
    ['Business type',  c.business_type],
    ['Reg. number',    c.reg_number],
    ['VAT number',     c.vat_number],
    ['Country',        c.country],
    ['Employees',      c.num_employees],
    ['Website',        c.website],
    ['Address',        c.address],
    ['Submitted at',   c.submitted_at ? new Date(c.submitted_at).toLocaleString('en-LK') : null],
    ['Reviewed at',    c.reviewed_at  ? new Date(c.reviewed_at).toLocaleString('en-LK')+' by '+(c.reviewed_by||'—') : null],
    ['Admin notes',    c.admin_notes],
    ['Schema name',    c.schema_name],
  ];

  document.getElementById('pr-drawer-body').innerHTML =
    fields.filter(([,v])=>v).map(([k,v])=>`
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
        <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${k}</div>
        <div style="font-size:13px;color:var(--text);line-height:1.4">${v}</div>
      </div>`).join('')+
    `<div style="margin-bottom:6px">
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">Admin notes</div>
      <textarea id="pr-notes-input" style="width:100%;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;font-size:12px;color:var(--text);font-family:'DM Mono',monospace;min-height:70px;resize:vertical"
        placeholder="Optional note about this decision…">${c.notes||''}</textarea>
    </div>`;

  // Action buttons
  let footer = '';
  if(c.status==='pending'||c.status==='rejected'){
    footer += `<button class="btn btn-primary" style="background:var(--green-bg);color:var(--accent);border:1px solid #0f4021" onclick="prApprove('${c.id}')">✓ Approve &amp; provision workspace</button>`;
  }
  if(c.status==='pending'||c.status==='approved'){
    footer += `<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:#3d1010" onclick="prReject('${c.id}')">✕ Reject</button>`;
  }
  if(c.status==='approved'){
    footer += `<button class="btn btn-ghost btn-sm" onclick="prSuspend('${c.id}')">⏸ Suspend</button>`;
  }
  footer += `<div id="pr-action-msg" style="font-family:'DM Mono',monospace;font-size:11px;margin-top:4px"></div>`;
  document.getElementById('pr-drawer-footer').innerHTML = footer;

  // Open drawer
  document.getElementById('pr-drawer-overlay').style.display = 'block';
  document.getElementById('pr-drawer').style.transform = 'translateX(0)';
}

function closePRDrawer(){
  document.getElementById('pr-drawer-overlay').style.display = 'none';
  document.getElementById('pr-drawer').style.transform = 'translateX(100%)';
}

function prShowActionMsg(msg, type){
  const el = document.getElementById('pr-action-msg');
  if(el){ el.textContent=msg; el.style.color=type==='ok'?'var(--accent)':'var(--red)'; }
}

async function prApprove(id){
  prShowActionMsg('Approving…','ok');
  try{
    const reg = allRegistrations.find(r=>r.id===id);
    if(!reg) throw new Error('Registration not found');

    // Generate unique safe schema name
    const safeName = (reg.company_name||'company')
      .toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_')
      .replace(/^_|_$/g,'').substring(0,28);
    const shortId = id.replace(/-/g,'').substring(0,6);
    const schemaName = 'co_'+safeName+'_'+shortId;

    prShowActionMsg('Provisioning workspace: '+schemaName+'…','ok');

    // Step 1: Call provision function
    const {error:rpcErr} = await window.sb.rpc('provision_company_schema',{p_schema_name:schemaName});
    if(rpcErr){
      if(rpcErr.message?.includes('does not exist')||rpcErr.message?.includes('function')||rpcErr.code==='42883'){
        prShowActionMsg('Run provision_schema.sql in Supabase SQL Editor first.','err');
        return;
      }
      throw rpcErr;
    }

    // Step 1b: Auto-expose schema via Edge Function (calls Supabase Management API)
    prShowActionMsg('Exposing schema to API…','ok');
    try{
      const SUPABASE_URL = window.SUPABASE_URL || '';
      const session = await window.sb.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      const exposeRes = await fetch(SUPABASE_URL + '/functions/v1/expose-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ schema_name: schemaName }),
      });
      const exposeData = await exposeRes.json();
      if(!exposeRes.ok){
        console.warn('Schema auto-expose failed (non-critical):', exposeData.error);
        prShowActionMsg('Schema created but auto-expose failed. Add "'+schemaName+'" manually in Dashboard > API > Exposed schemas.','err');
      } else {
        console.log('Schema auto-exposed:', exposeData.message);
      }
    }catch(expErr){
      console.warn('Edge Function call failed (non-critical):', expErr);
    }

    // Step 2: Save schema_name + approved status
    const {data:updated, error:upErr} = await window.sb.from('registrations').update({
      status:      'approved',
      schema_name: schemaName,
      reviewed_by: ADMIN_EMAIL,
      reviewed_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }).eq('id',id).select('schema_name,status').single();
    if(upErr) throw upErr;

    // Step 3: Verify it was actually saved
    if(!updated?.schema_name){
      throw new Error('schema_name was not saved — check RLS update policy on registrations table');
    }

    prShowActionMsg('Approved. Workspace "'+schemaName+'" ready. User can now sign in.','ok');
    await loadPendingRequests();
    setTimeout(closePRDrawer, 2000);
  }catch(e){
    prShowActionMsg('Error: '+e.message,'err');
  }
}

async function prReject(id){
  const notes = document.getElementById('pr-notes-input')?.value||'';
  prShowActionMsg('Rejecting…','ok');
  try{
    const {error} = await window.sb.from('registrations').update({
      status:      'rejected',
      admin_notes: notes||null,
      reviewed_by: ADMIN_EMAIL,
      reviewed_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }).eq('id', id);
    if(error) throw error;
    prShowActionMsg('Rejected.','ok');
    await loadPendingRequests();
    setTimeout(closePRDrawer, 1000);
  }catch(e){
    prShowActionMsg('Error: '+e.message,'err');
  }
}

async function prSuspend(id){
  prShowActionMsg('Suspending…','ok');
  const {error} = await window.sb.from('registrations').update({
    status:'suspended',
    reviewed_by: ADMIN_EMAIL,
    reviewed_at: new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).eq('id',id);
  if(error){ prShowActionMsg('Error: '+error.message,'err'); return; }
  prShowActionMsg('Suspended.','ok');
  await loadPendingRequests();
  setTimeout(closePRDrawer, 1000);
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
// pageNames imported from router.js
// navTo imported from router.js




// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  loadPendingRequests, renderPRSummary, setPRTab, renderPRTable,
  openPRDrawer, closePRDrawer, prApprove, prReject, prSuspend,
});
