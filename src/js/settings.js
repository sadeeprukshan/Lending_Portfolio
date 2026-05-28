// ── settings.js ────────────────────────────────────────────────────────────
// Settings page: app config table (admin), password change, goal config.
// Reads window.sb, window.currentCompany, window.GOAL, etc.

import { dbFrom } from '/js/db.js';
import { fmt, showMsg } from '/js/helpers.js';

// ── SETTINGS ─────────────────────────────────────────────────────────────────
// ── APP CONFIG (db_connections table) ─────────────────────────────────────────
let allConfigs = [];

async function loadConfigFromDB(){
  const status = document.getElementById('cfg-sync-status');
  if(status) status.textContent = 'Loading…';
  try{
    const {data,error} = await dbFrom('app_config').select('*').order('config_key');
    if(error) throw error;
    allConfigs = data || [];
    renderConfigTable();
    if(status) status.textContent = 'Synced ' + new Date().toLocaleTimeString('en-LK',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    if(status) status.textContent = 'DB error: '+e.message;
    allConfigs = [];
    renderConfigTable();
  }
}

function renderConfigTable(){
  const tbody = document.getElementById('config-tbody');
  if(!tbody) return;
  if(!allConfigs.length){
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px;font-size:12px">No config entries. Run <code>create_app_config.sql</code> first.</td></tr>';
    return;
  }
  tbody.innerHTML = allConfigs.map(c => {
    // Mask sensitive values
    const isSensitive = c.config_key.includes('key') || c.config_key.includes('secret') || c.config_key.includes('password');
    const displayVal  = isSensitive && c.config_value ? c.config_value.slice(0,16)+'…' : (c.config_value||'—');
    const updated = c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-LK',{day:'numeric',month:'short',year:'2-digit'}) : '—';
    return `<tr>
      <td class="mono" style="font-weight:600;color:var(--accent)">${c.config_key}</td>
      <td class="mono" style="color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.config_value||''}">${displayVal}</td>
      <td style="color:var(--muted);font-size:11px">${c.description||'—'}</td>
      <td class="mono" style="color:var(--dim);font-size:10px">${updated}</td>
      <td>
        <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 8px"
          onclick="editConfigRow('${c.config_key}','${(c.config_value||'').replace(/'/g,"\'")}','${(c.description||'').replace(/'/g,"\'")}')"
        >Edit</button>
        <button class="btn btn-red btn-sm" style="font-size:10px;padding:3px 8px;margin-left:4px"
          onclick="deleteConfig('${c.config_key}')"
        >✕</button>
      </td>
    </tr>`;
  }).join('');
}

function editConfigRow(key, value, desc){
  document.getElementById('cfg-key').value = key;
  document.getElementById('cfg-value').value = value;
  document.getElementById('cfg-desc').value = desc;
  document.getElementById('cfg-key').focus();
}

function clearConfigForm(){
  ['cfg-key','cfg-value','cfg-desc'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('cfg-msg').textContent='';
}

async function upsertConfig(){
  const key   = (document.getElementById('cfg-key').value||'').trim();
  const value = (document.getElementById('cfg-value').value||'').trim();
  const desc  = (document.getElementById('cfg-desc').value||'').trim();
  if(!key){showMsg('cfg-msg','Key is required.','err');return;}
  showMsg('cfg-msg','Saving…','ok');
  const {error} = await dbFrom('app_config').upsert(
    {config_key:key, config_value:value, description:desc||null, updated_at:new Date().toISOString()},
    {onConflict:'config_key'}
  );
  if(error){showMsg('cfg-msg','Error: '+error.message,'err');return;}
  showMsg('cfg-msg','Saved: '+key,'ok');
  clearConfigForm();
  await loadConfigFromDB();
  // If URL or key was updated, also sync to localStorage
  if(key==='supabase_url')  localStorage.setItem('sb_url',value);
  if(key==='supabase_key')  localStorage.setItem('sb_key',value);
}

async function deleteConfig(key){
  if(!confirm('Delete config entry "'+key+'"?')) return;
  const {error} = await dbFrom('app_config').delete().eq('config_key',key);
  if(error){alert('Error: '+error.message);return;}
  await loadConfigFromDB();
}

function loadSettingsPage(){
  loadGoalSettings();
  // Show current user email — try multiple sources
  const emailEl = document.getElementById('settings-user-email');
  if(emailEl){
    // Source 1: currentCompany from auth resolution
    if(window.currentCompany?.email){
      emailEl.textContent = window.currentCompany.email;
    }
    // Source 2: Supabase session
    else if(window.sb){
      window.sb.auth.getSession().then(function(res){
        var email = res?.data?.session?.user?.email;
        if(email && emailEl) emailEl.textContent = email;
      }).catch(function(){});
    }
  }
  // Load config table from DB (admin only)
  if(window.isAdmin && window.isAdmin()) loadConfigFromDB();
}

async function saveSettingsCredentials(){
  // Admin-only — save credentials to app_config table
  const url = localStorage.getItem('sb_url')||'';
  const key = localStorage.getItem('sb_key')||'';
  if(!url||!key) return;
  try{
    await dbFrom('app_config').upsert([
      {config_key:'supabase_url', config_value:url, description:'Supabase project URL', updated_at:new Date().toISOString()},
      {config_key:'supabase_key', config_value:key, description:'Supabase publishable key', updated_at:new Date().toISOString()},
    ],{onConflict:'config_key'});
  }catch(e){ console.warn('Could not save to DB:', e.message); }
}

function confirmResetCredentials(){
  if(confirm('This will clear your saved credentials and return to the setup screen. Continue?')){
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
    location.reload();
  }
}

// interest payments imported from /js/payments.js

// repayment overview imported from /js/payments.js

// payment detail imported from /js/payments.js

// document vault imported from /js/documents.js


async function changePassword(){
  const pass1 = document.getElementById('settings-new-pass').value;
  const pass2 = document.getElementById('settings-new-pass2').value;
  const msg   = document.getElementById('settings-pass-msg');
  if(!pass1 || !pass2){ showMsg('settings-pass-msg','Both fields are required.','err'); return; }
  if(pass1 !== pass2){ showMsg('settings-pass-msg','Passwords do not match.','err'); return; }
  if(pass1.length < 8){ showMsg('settings-pass-msg','Password must be at least 8 characters.','err'); return; }
  showMsg('settings-pass-msg','Updating password…','ok');
  const {error} = await window.sb.auth.updateUser({password: pass1});
  if(error){
    showMsg('settings-pass-msg','Error: '+error.message,'err');
  } else {
    showMsg('settings-pass-msg','Password updated successfully.','ok');
    document.getElementById('settings-new-pass').value='';
    document.getElementById('settings-new-pass2').value='';
  }
}


// ── GOAL SETTINGS ─────────────────────────────────────────────────────────
function saveGoal(){
  const amount = parseFloat(document.getElementById('settings-goal-amount')?.value) || 0;
  const date   = document.getElementById('settings-goal-date')?.value || '';
  if(!amount || amount < 1000){
    showMsg('settings-goal-msg','Enter a valid goal amount (min 1,000).','err');
    return;
  }
  localStorage.setItem('lending_goal_amount', String(amount));
  localStorage.setItem('lending_goal_date', date);
  window.GOAL = amount;
  showMsg('settings-goal-msg','Goal saved: LKR ' + fmt(amount) + (date ? ' by ' + date : ''),'ok');
}


function loadGoalSettings(){
  // Goal/target date stay in localStorage (user preference)
  const savedAmount = localStorage.getItem('lending_goal_amount');
  const savedDate   = localStorage.getItem('lending_goal_date');
  if(savedAmount){
    const el = document.getElementById('settings-goal-amount');
    if(el) el.value = savedAmount;
    window.GOAL = parseFloat(savedAmount);
  }
  if(savedDate){
    const el = document.getElementById('settings-goal-date');
    if(el) el.value = savedDate;
  }

  // Populate About labels from app_config DB table
  populateAboutLabels();
}

async function populateAboutLabels(){
  try{
    const {data} = await dbFrom('app_config').select('config_key, config_value');
    const cfg = {};
    (data||[]).forEach(r => { cfg[r.config_key] = r.config_value; });

    // App name
    const appEl = document.getElementById('about-app-label');
    if(appEl) appEl.textContent = cfg.app_name || cfg.app_version || 'LendingOS v5';

    // Rate — read from app_config.interest_rate (decimal e.g. 0.08) or default to 8%
    const rateEl = document.getElementById('about-rate-label');
    if(rateEl){
      const rateRaw = parseFloat(cfg.interest_rate);
      const ratePct = !isNaN(rateRaw)
        ? (rateRaw < 1 ? rateRaw * 100 : rateRaw)   // accepts 0.08 or 8
        : (window.RATE * 100);
      rateEl.textContent = ratePct.toFixed(2).replace(/\.?0+$/,'') + '% / month';
    }

    // Goal & target date — read from localStorage (still user-editable below)
    const goalEl = document.getElementById('about-goal-label');
    if(goalEl){
      const g = parseFloat(localStorage.getItem('lending_goal_amount')) || window.GOAL || 1000000;
      goalEl.textContent = 'LKR ' + fmt(g) + ' / month';
    }
    const dateEl = document.getElementById('about-goal-date-label');
    if(dateEl){
      const d = localStorage.getItem('lending_goal_date') || '';
      dateEl.textContent = d || '—';
    }
  }catch(e){
    console.warn('Could not load app_config for About labels:', e);
    // Fallback: use window.RATE
    const rateEl = document.getElementById('about-rate-label');
    if(rateEl){
      const ratePct = (window.RATE || 0.08) * 100;
      rateEl.textContent = ratePct.toFixed(2).replace(/\.?0+$/,'') + '% / month';
    }
  }
}


// ── Company Info (Owner editable) ─────────────────────────────────────────
let _companyUnsaved = false;

function markCompanyUnsaved() {
  _companyUnsaved = true;
  const btn = document.getElementById('settings-company-save-btn');
  if (btn) btn.style.opacity = '1';
}

async function loadCompanyInfo() {
  const co = window.currentCompany || {};
  const nameInput = document.getElementById('settings-company-name');
  const emailInput = document.getElementById('settings-company-email');
  if (nameInput) nameInput.value = co.company_name || '';
  if (emailInput) emailInput.value = co.email || '';
  _companyUnsaved = false;
}

async function saveCompanyInfo() {
  const role = window.currentUserRole || 'viewer';
  if (role !== 'owner') {
    showMsg('settings-company-msg', 'Only owners can edit company info.', 'err');
    return;
  }
  const newName = document.getElementById('settings-company-name')?.value?.trim();
  if (!newName) {
    showMsg('settings-company-msg', 'Company name cannot be empty.', 'err');
    return;
  }
  const regId = window.currentCompany?.reg_id;
  if (!regId) {
    showMsg('settings-company-msg', 'No registration record found.', 'err');
    return;
  }
  try {
    const { error } = await window.sb.from('registrations')
      .update({ company_name: newName })
      .eq('id', regId);
    if (error) throw error;
    window.currentCompany.company_name = newName;
    _companyUnsaved = false;
    showMsg('settings-company-msg', 'Company info saved.', 'ok');
    // Update sidebar label
    const sidebar = document.getElementById('sidebar-company-name');
    if (sidebar) sidebar.textContent = newName;
  } catch (e) {
    showMsg('settings-company-msg', 'Error: ' + (e.message || 'Failed to save'), 'err');
  }
}

// ── Apply viewer restrictions on Settings page ────────────────────────────
function applySettingsPermissions() {
  const role = window.currentUserRole || 'viewer';
  const canEdit = role === 'owner';

  // Company section: only show for owner, hide for others
  const companySection = document.getElementById('settings-company-section');
  if (companySection) {
    companySection.style.display = canEdit ? '' : 'none';
  }

  // Goal section editability — only owner can edit goal/rate
  const goalAmount = document.getElementById('settings-goal-amount');
  const goalDate = document.getElementById('settings-goal-date');
  const saveGoalBtn = document.getElementById('settings-save-goal-btn');
  if (goalAmount) {
    goalAmount.readOnly = !canEdit;
    goalAmount.style.opacity = canEdit ? '1' : '.6';
  }
  if (goalDate) {
    goalDate.readOnly = !canEdit;
    goalDate.style.opacity = canEdit ? '1' : '.6';
  }
  if (saveGoalBtn) {
    saveGoalBtn.style.display = canEdit ? '' : 'none';
  }
}

// ── Theme Toggle ──────────────────────────────────────────────────────────
function getThemeKey() {
  const email = window.currentCompany?.email || localStorage.getItem('lendingos_last_email') || 'guest';
  return 'lendingos_theme_' + email.toLowerCase();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(getThemeKey(), next);
  // Also save under a generic key as fallback for pre-login flash prevention
  localStorage.setItem('lendingos_theme_last', next);
  updateThemeLabel(next);
}

function loadSavedTheme() {
  // Try per-user key first, fall back to last-used theme
  const userKey = getThemeKey();
  const saved = localStorage.getItem(userKey) || localStorage.getItem('lendingos_theme_last') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeLabel(saved);
}

// Re-apply theme when user logs in (called from auth.js launchApp)
function applyUserTheme() {
  loadSavedTheme();
}

function updateThemeLabel(theme) {
  const label = document.getElementById('theme-toggle-label');
  if (label) label.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
}

// Load theme on module init (runs immediately when settings.js is imported)
loadSavedTheme();

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  loadConfigFromDB, renderConfigTable, editConfigRow, clearConfigForm,
  upsertConfig, deleteConfig, loadSettingsPage, saveSettingsCredentials,
  changePassword, saveGoal, loadGoalSettings,
  confirmResetCredentials, toggleTheme, loadSavedTheme, applyUserTheme,
  saveCompanyInfo, loadCompanyInfo, markCompanyUnsaved, applySettingsPermissions,
});
