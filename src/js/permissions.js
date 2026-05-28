// ── permissions.js ─────────────────────────────────────────────────────────
// Role-based access control engine for LendingOS.
// Manages module visibility and action permissions per user.
//
// 4 roles: owner > admin > manager > viewer
// 2 dimensions: module visibility + action permissions (view/add/edit/delete)
// Owner can customize individual user permissions beyond their default role.

// ── Default Permission Matrix ─────────────────────────────────────────────
// Each module has: visible (bool), actions: { view, add, edit, delete }
const DEFAULT_PERMISSIONS = {
  owner: {
    dashboard:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    loans:              { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: true  } },
    customers:          { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: true  } },
    brokers:            { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: true  } },
    'interest-payments':{ visible: true,  actions: { view: true,  add: true,  edit: true,  delete: true  } },
    'repayment-overview':{ visible: true, actions: { view: true,  add: false, edit: false, delete: false } },
    projection:         { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    calendar:           { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    documents:          { visible: true,  actions: { view: true,  add: true,  edit: false, delete: true  } },
    settings:           { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: true  } },
    'credit-score':     { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'user-management':  { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: true  } },
  },
  admin: {
    dashboard:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    loans:              { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: false } },
    customers:          { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: false } },
    brokers:            { visible: true,  actions: { view: true,  add: true,  edit: true,  delete: false } },
    'interest-payments':{ visible: true,  actions: { view: true,  add: true,  edit: true,  delete: false } },
    'repayment-overview':{ visible: true, actions: { view: true,  add: false, edit: false, delete: false } },
    projection:         { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    calendar:           { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    documents:          { visible: true,  actions: { view: true,  add: true,  edit: false, delete: false } },
    settings:           { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'credit-score':     { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'credit-score':     { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
    'user-management':  { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
  },
  manager: {
    dashboard:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    loans:              { visible: true,  actions: { view: true,  add: false, edit: true,  delete: false } },
    customers:          { visible: true,  actions: { view: true,  add: false, edit: true,  delete: false } },
    brokers:            { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'interest-payments':{ visible: true,  actions: { view: true,  add: true,  edit: true,  delete: false } },
    'repayment-overview':{ visible: true, actions: { view: true,  add: false, edit: false, delete: false } },
    projection:         { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    calendar:           { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    documents:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    settings:           { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
    'credit-score':     { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'credit-score':     { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
    'user-management':  { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
  },
  viewer: {
    dashboard:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    loans:              { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    customers:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    brokers:            { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'interest-payments':{ visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'repayment-overview':{ visible: true, actions: { view: true,  add: false, edit: false, delete: false } },
    projection:         { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    calendar:           { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    documents:          { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    settings:           { visible: true,  actions: { view: true,  add: false, edit: false, delete: false } },
    'credit-score':     { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
    'user-management':  { visible: false, actions: { view: false, add: false, edit: false, delete: false } },
  },
};

// ── Current user permissions (set after login) ────────────────────────────
let currentUserRole = 'viewer';
let currentUserPerms = {};  // merged: default role + custom overrides

// ── Get default permissions for a role ────────────────────────────────────
export function getDefaultPerms(role) {
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.viewer));
}

// ── Merge custom overrides on top of role defaults ────────────────────────
// customPerms is a JSON object from the company_users.permissions column
// Structure: { "loans": { "actions": { "delete": true } }, "settings": { "visible": true } }
export function mergePerms(role, customPerms) {
  const base = getDefaultPerms(role);
  if (!customPerms || typeof customPerms !== 'object') return base;

  for (const mod of Object.keys(customPerms)) {
    if (!base[mod]) continue;  // ignore unknown modules
    const override = customPerms[mod];
    if (typeof override.visible === 'boolean') base[mod].visible = override.visible;
    if (override.actions && typeof override.actions === 'object') {
      for (const act of Object.keys(override.actions)) {
        if (typeof override.actions[act] === 'boolean') {
          base[mod].actions[act] = override.actions[act];
        }
      }
    }
  }
  return base;
}

// ── Set current user permissions (called after login resolves) ────────────
export function setUserPermissions(role, customPerms) {
  currentUserRole = role || 'viewer';
  currentUserPerms = mergePerms(currentUserRole, customPerms);
  window.currentUserRole = currentUserRole;
  window.currentUserPerms = currentUserPerms;
}

// ── Check if current user can see a module ────────────────────────────────
export function canSeeModule(moduleName) {
  const mod = currentUserPerms[moduleName];
  return mod ? mod.visible : false;
}

// ── Check if current user can perform an action on a module ───────────────
// action: 'view' | 'add' | 'edit' | 'delete'
export function canDo(moduleName, action) {
  const mod = currentUserPerms[moduleName];
  if (!mod || !mod.visible) return false;
  return mod.actions?.[action] || false;
}

// ── Apply module visibility to sidebar ────────────────────────────────────
// Hides nav items the user cannot see + hides add/edit/delete buttons
export function applySidebarPermissions() {
  // Map of nav element IDs to module names
  const navMap = {
    'nav-dashboard':          'dashboard',
    'nav-loans':              'loans',
    'nav-customers':          'customers',
    'nav-brokers':            'brokers',
    'nav-interest-payments':  'interest-payments',
    'nav-repayment-overview': 'repayment-overview',
    'nav-projection':         'projection',
    'nav-calendar':           'calendar',
    'nav-settings':           'settings',
    'nav-credit-score':       'credit-score',
    'nav-user-management':    'user-management',
  };

  for (const [navId, modName] of Object.entries(navMap)) {
    const el = document.getElementById(navId);
    if (el) {
      el.style.display = canSeeModule(modName) ? '' : 'none';
    }
  }

  // Hide +New / Add buttons based on add permissions
  const addBtnMap = {
    'btn-new-loan':     'loans',
    'btn-add-loan':     'loans',
    'btn-new-broker':   'brokers',
    'btn-new-customer': 'customers',
  };
  for (const [btnId, modName] of Object.entries(addBtnMap)) {
    const el = document.getElementById(btnId);
    if (el) el.style.display = canDo(modName, 'add') ? '' : 'none';
  }

  // Hide delete buttons globally if no delete permission
  document.querySelectorAll('[data-perm-delete]').forEach(el => {
    const mod = el.dataset.permDelete;
    el.style.display = canDo(mod, 'delete') ? '' : 'none';
  });

  // Hide edit buttons globally if no edit permission
  document.querySelectorAll('[data-perm-edit]').forEach(el => {
    const mod = el.dataset.permEdit;
    el.style.display = canDo(mod, 'edit') ? '' : 'none';
  });
}

// ── Apply action permissions to UI elements ───────────────────────────────
// Hides/disables add/edit/delete buttons based on permissions
export function applyPagePermissions(moduleName) {
  // Add buttons
  const addBtns = document.querySelectorAll(`[data-perm-add="${moduleName}"]`);
  addBtns.forEach(el => { el.style.display = canDo(moduleName, 'add') ? '' : 'none'; });

  // Edit buttons
  const editBtns = document.querySelectorAll(`[data-perm-edit="${moduleName}"]`);
  editBtns.forEach(el => { el.style.display = canDo(moduleName, 'edit') ? '' : 'none'; });

  // Delete buttons
  const delBtns = document.querySelectorAll(`[data-perm-delete="${moduleName}"]`);
  delBtns.forEach(el => { el.style.display = canDo(moduleName, 'delete') ? '' : 'none'; });

  // Inputs/selects — make read-only if no edit permission
  if (!canDo(moduleName, 'edit')) {
    const inputs = document.querySelectorAll(`[data-perm-field="${moduleName}"]`);
    inputs.forEach(el => {
      el.setAttribute('readonly', 'true');
      el.setAttribute('disabled', 'true');
    });
  }
}

// ── Get all module names ──────────────────────────────────────────────────
export function getAllModules() {
  return Object.keys(DEFAULT_PERMISSIONS.owner);
}

// ── Get all roles ─────────────────────────────────────────────────────────
export function getAllRoles() {
  return ['owner', 'admin', 'manager', 'viewer'];
}

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  getDefaultPerms, mergePerms, setUserPermissions,
  canSeeModule, canDo, applySidebarPermissions, applyPagePermissions,
  getAllModules, getAllRoles, DEFAULT_PERMISSIONS,
  currentUserRole, currentUserPerms,
});
