// ── users.js ──────────────────────────────────────────────────────────────
// User Management page — Owner-only module.
// Add/edit/remove company users, assign roles, customize permissions.

import { dbFrom } from '/js/db.js';
import { fmt, showMsg } from '/js/helpers.js';
import { getDefaultPerms, mergePerms, getAllModules, getAllRoles } from '/js/permissions.js';

let companyUsers = [];
let editingUserId = null;

// ── Load all company users ────────────────────────────────────────────────
async function loadCompanyUsers() {
  if (!window.currentSchema) {
    const tbody = document.getElementById('um-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">User management is available for company owners. Platform admin manages companies via Pending Requests.</td></tr>';
    return;
  }
  try {
    const { data, error } = await dbFrom('company_users').select('*').order('created_at');
    if (error) throw error;
    companyUsers = data || [];
    renderUserList();
    filterAddRoleOptions();
  } catch (e) {
    console.warn('Failed to load company users:', e);
    const tbody = document.getElementById('um-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:20px">Failed to load users. Make sure company_users table exists.</td></tr>';
  }
}

// ── Render user list table ────────────────────────────────────────────────
function renderUserList() {
  const tbody = document.getElementById('um-tbody');
  if (!tbody) return;

  if (!companyUsers.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No users added yet. Add users below.</td></tr>';
    return;
  }

  const roleBadge = (r) => {
    const cls = { owner: 'bg', admin: 'ba', manager: 'bb', viewer: '' };
    return `<span class="badge ${cls[r] || ''}">${r}</span>`;
  };
  const statusBadge = (s) => {
    const cls = { active: 'bg', invited: 'bb', suspended: 'br' };
    return `<span class="badge ${cls[s] || ''}">${s}</span>`;
  };

  tbody.innerHTML = companyUsers.map(u => `
    <tr style="cursor:pointer" onclick="openUserEditor('${u.id}')">
      <td style="font-weight:600">${u.full_name || '—'}</td>
      <td class="mono" style="font-size:11px">${u.email}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${statusBadge(u.status)}</td>
      <td class="mono" style="font-size:10px;color:var(--muted)">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
      <td>
        <button class="btn btn-sm" onclick="event.stopPropagation();toggleUserStatus('${u.id}','${u.status}')" title="${u.status === 'suspended' ? 'Reactivate' : 'Suspend'}">${u.status === 'suspended' ? 'Activate' : 'Suspend'}</button>
        ${u.role !== 'owner' ? `<button class="btn btn-sm btn-red" onclick="event.stopPropagation();removeUser('${u.id}')" title="Remove user">Remove</button>` : ''}
      </td>
    </tr>
  `).join('');
}

// ── Add new user (invite via Supabase Auth) ───────────────────────────────
async function addCompanyUser() {
  if (!window.currentSchema) { showMsg('um-msg', 'User management requires a company schema.', 'err'); return; }
  const email = document.getElementById('um-email')?.value?.trim();
  const name  = document.getElementById('um-name')?.value?.trim();
  const role  = document.getElementById('um-role')?.value || 'viewer';

  if (!email) { showMsg('um-msg', 'Email is required.', 'err'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg('um-msg', 'Invalid email address.', 'err'); return; }

  // Check duplicate
  if (companyUsers.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    showMsg('um-msg', 'User with this email already exists.', 'err');
    return;
  }

  // Authority check — can only add users at or below your rank (minus 1)
  const myRole = window.currentUserRole || 'viewer';
  const roleRank = { owner: 4, admin: 3, manager: 2, viewer: 1 };
  const myRank = roleRank[myRole] || 1;
  const targetRank = roleRank[role] || 1;

  if (myRole !== 'owner' && targetRank >= myRank) {
    showMsg('um-msg', 'You can only add users with a role below yours.', 'err');
    return;
  }

  showMsg('um-msg', 'Sending invitation…', 'ok');

  try {
    // Step 1: Send invitation email via Edge Function (uses service_role key server-side)
    const SUPABASE_URL = window.SUPABASE_URL || '';
    const session = await window.sb.auth.getSession();
    const token = session?.data?.session?.access_token || '';
    
    const inviteRes = await fetch(SUPABASE_URL + '/functions/v1/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({
        email: email.toLowerCase(),
        company_name: window.currentCompany?.company_name || 'LendingOS',
        role: role,
      }),
    });
    const inviteData = await inviteRes.json();
    
    if (!inviteRes.ok && !inviteData.already_exists) {
      throw new Error(inviteData.error || 'Failed to send invitation');
    }

    // Step 2: Add user to company_users table in tenant schema
    const { data, error } = await dbFrom('company_users').insert([{
      email:       email.toLowerCase(),
      full_name:   name || null,
      role:        role,
      status:      'invited',
      user_id:     inviteData.user_id || null,
      permissions: {},  // empty = use role defaults
      invited_by:  window.currentCompany?.email || 'unknown',
    }]).select();

    if (error) throw error;

    const emailMsg = inviteData.already_exists
      ? `User "${email}" already has an account. Added as ${role} — they can log in with existing credentials.`
      : `Invitation email sent to "${email}" as ${role}. They will receive a link to set their password.`;
    showMsg('um-msg', emailMsg, 'ok');

    // Clear form
    document.getElementById('um-email').value = '';
    document.getElementById('um-name').value = '';
    document.getElementById('um-role').value = 'viewer';

    await loadCompanyUsers();
  } catch (e) {
    showMsg('um-msg', 'Error: ' + (e.message || 'Failed to add user'), 'err');
  }
}

// ── Open user permission editor ───────────────────────────────────────────
function openUserEditor(userId) {
  const user = companyUsers.find(u => u.id === userId);
  if (!user) return;

  // Authority check — can only edit users below your rank (or yourself if owner)
  const myRole = window.currentUserRole || 'viewer';
  const roleRank = { owner: 4, admin: 3, manager: 2, viewer: 1 };
  const myRank = roleRank[myRole] || 1;
  const targetRank = roleRank[user.role] || 1;
  const isSelf = user.email === (window.currentCompany?.email || '');

  if (myRank <= targetRank && !isSelf) {
    showMsg('um-msg', 'You cannot edit a user with equal or higher authority.', 'err');
    return;
  }

  editingUserId = userId;
  const editor = document.getElementById('um-editor');
  if (!editor) return;

  editor.style.display = 'block';
  document.getElementById('um-edit-title').textContent = `Edit: ${user.full_name || user.email}`;
  document.getElementById('um-edit-role').value = user.role;

  renderPermissionGrid(user.role, user.permissions || {});
  filterEditorRoleOptions();
  editor.scrollIntoView({ behavior: 'smooth' });
}

// ── Render permission grid (checkboxes per module/action) ─────────────────
// Filter role options in editor based on authority
function filterEditorRoleOptions() {
  const myRole = window.currentUserRole || 'viewer';
  const roleRank = { owner: 4, admin: 3, manager: 2, viewer: 1 };
  const myRank = roleRank[myRole] || 1;
  const sel = document.getElementById('um-edit-role');
  if (!sel) return;

  // Disable roles at or above current user's rank (except owner can assign all)
  Array.from(sel.options).forEach(opt => {
    const optRank = roleRank[opt.value] || 1;
    if (myRole === 'owner') {
      opt.disabled = false;  // owner can assign any role
    } else {
      opt.disabled = optRank >= myRank;  // can only assign roles below your rank
    }
  });
}

function renderPermissionGrid(role, customPerms) {
  const grid = document.getElementById('um-perm-grid');
  if (!grid) return;

  const merged = mergePerms(role, customPerms);
  const defaults = getDefaultPerms(role);
  const modules = getAllModules();

  const moduleLabels = {
    'dashboard': 'Dashboard',
    'loans': 'All Loans',
    'customers': 'Customers',
    'brokers': 'Brokers',
    'interest-payments': 'Interest Payments',
    'repayment-overview': 'Repayment Overview',
    'projection': 'Projection',
    'calendar': 'Pay Calendar',
    'documents': 'Documents',
    'settings': 'Settings',
    'user-management': 'User Management',
  };

  let html = `
    <table class="dtable" style="font-size:11px">
      <thead>
        <tr>
          <th>Module</th>
          <th>Visible</th>
          <th>View</th>
          <th>Add</th>
          <th>Edit</th>
          <th>Delete</th>
        </tr>
      </thead>
      <tbody>`;

  for (const mod of modules) {
    const m = merged[mod];
    if (!m) continue;
    const label = moduleLabels[mod] || mod;
    const d = defaults[mod];

    html += `<tr>
      <td style="font-weight:600">${label}</td>
      <td><input type="checkbox" data-mod="${mod}" data-perm="visible" ${m.visible ? 'checked' : ''} ${d.visible === m.visible ? '' : 'style="accent-color:var(--amber)"'} onchange="permChanged()"></td>
      <td><input type="checkbox" data-mod="${mod}" data-perm="view" ${m.actions.view ? 'checked' : ''} onchange="permChanged()"></td>
      <td><input type="checkbox" data-mod="${mod}" data-perm="add" ${m.actions.add ? 'checked' : ''} onchange="permChanged()"></td>
      <td><input type="checkbox" data-mod="${mod}" data-perm="edit" ${m.actions.edit ? 'checked' : ''} onchange="permChanged()"></td>
      <td><input type="checkbox" data-mod="${mod}" data-perm="delete" ${m.actions.delete ? 'checked' : ''} onchange="permChanged()"></td>
    </tr>`;
  }

  html += '</tbody></table>';
  grid.innerHTML = html;
}

// ── When role dropdown changes in editor, re-render grid with new defaults ─
function editorRoleChanged() {
  const role = document.getElementById('um-edit-role')?.value || 'viewer';
  renderPermissionGrid(role, {});
}

// ── Mark that permissions have been customized (visual indicator) ──────────
function permChanged() {
  // Could add a "modified" indicator here
}

// ── Collect custom permission overrides from the grid ─────────────────────
function collectPermOverrides() {
  const role = document.getElementById('um-edit-role')?.value || 'viewer';
  const defaults = getDefaultPerms(role);
  const overrides = {};
  const checkboxes = document.querySelectorAll('#um-perm-grid input[type="checkbox"]');

  checkboxes.forEach(cb => {
    const mod = cb.dataset.mod;
    const perm = cb.dataset.perm;
    const checked = cb.checked;

    if (!defaults[mod]) return;

    if (perm === 'visible') {
      if (checked !== defaults[mod].visible) {
        if (!overrides[mod]) overrides[mod] = {};
        overrides[mod].visible = checked;
      }
    } else {
      if (checked !== defaults[mod].actions[perm]) {
        if (!overrides[mod]) overrides[mod] = {};
        if (!overrides[mod].actions) overrides[mod].actions = {};
        overrides[mod].actions[perm] = checked;
      }
    }
  });

  return overrides;
}

// ── Save user edits (role + custom permissions) ───────────────────────────
async function saveUserEdit() {
  if (!editingUserId) return;

  const role = document.getElementById('um-edit-role')?.value || 'viewer';
  const overrides = collectPermOverrides();

  try {
    const { error } = await dbFrom('company_users')
      .update({
        role: role,
        permissions: overrides,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingUserId);

    if (error) throw error;

    showMsg('um-edit-msg', 'User updated successfully.', 'ok');
    await loadCompanyUsers();
  } catch (e) {
    showMsg('um-edit-msg', 'Error: ' + (e.message || 'Failed to save'), 'err');
  }
}

// ── Close editor ──────────────────────────────────────────────────────────
function closeUserEditor() {
  editingUserId = null;
  const editor = document.getElementById('um-editor');
  if (editor) editor.style.display = 'none';
}

// ── Toggle user status (active <-> suspended) ─────────────────────────────
async function toggleUserStatus(userId, currentStatus) {
  const user = companyUsers.find(u => u.id === userId);
  if (user) {
    const myRole = window.currentUserRole || 'viewer';
    const roleRank = { owner: 4, admin: 3, manager: 2, viewer: 1 };
    if ((roleRank[myRole]||1) <= (roleRank[user.role]||1)) {
      showMsg('um-msg', 'You cannot suspend a user with equal or higher authority.', 'err');
      return;
    }
  }
  const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  try {
    const { error } = await dbFrom('company_users')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
    await loadCompanyUsers();
  } catch (e) {
    showMsg('um-msg', 'Error: ' + (e.message || 'Failed to update status'), 'err');
  }
}

// ── Remove user from company ──────────────────────────────────────────────
async function removeUser(userId) {
  const user = companyUsers.find(u => u.id === userId);
  if (!user) return;
  const myRole = window.currentUserRole || 'viewer';
  const roleRank = { owner: 4, admin: 3, manager: 2, viewer: 1 };
  if ((roleRank[myRole]||1) <= (roleRank[user.role]||1)) {
    showMsg('um-msg', 'You cannot remove a user with equal or higher authority.', 'err');
    return;
  }

  if (!confirm(`Remove "${user.full_name || user.email}" from this company? They will lose access.`)) return;

  try {
    const { error } = await dbFrom('company_users').delete().eq('id', userId);
    if (error) throw error;
    showMsg('um-msg', 'User removed.', 'ok');
    await loadCompanyUsers();
  } catch (e) {
    showMsg('um-msg', 'Error: ' + (e.message || 'Failed to remove user'), 'err');
  }
}

// ── Reset permissions to role defaults ────────────────────────────────────
function resetPermsToDefault() {
  const role = document.getElementById('um-edit-role')?.value || 'viewer';
  renderPermissionGrid(role, {});
}

// ── Filter add-user role dropdown based on authority ──────────────────────
function filterAddRoleOptions() {
  const myRole = window.currentUserRole || 'viewer';
  const roleRank = { owner: 4, admin: 3, manager: 2, viewer: 1 };
  const myRank = roleRank[myRole] || 1;
  const sel = document.getElementById('um-role');
  if (!sel) return;

  Array.from(sel.options).forEach(opt => {
    const optRank = roleRank[opt.value] || 1;
    if (myRole === 'owner') {
      opt.disabled = false;
    } else {
      opt.disabled = optRank >= myRank;
    }
  });
}

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  loadCompanyUsers, renderUserList, addCompanyUser,
  openUserEditor, closeUserEditor, saveUserEdit,
  editorRoleChanged, permChanged, resetPermsToDefault,
  toggleUserStatus, removeUser, filterAddRoleOptions, filterEditorRoleOptions,
});
