// ── router.js ──────────────────────────────────────────────────────────────
// Page navigation, sidebar management, and page title mapping.
// All page-specific render calls go through window.* to avoid import deps.

// ── Page names ────────────────────────────────────────────────────────────
const pageNames = {
  dashboard:          'Dashboard',
  loans:              'All Loans',
  documents:          'Documents',
  'repayment-overview': 'Repayment Overview',
  projection:         'Projection',
  calendar:           'Pay Calendar',
  brokers:            'Brokers',
  customers:          'Customers',
  'interest-payments': 'Interest Payments',
  add:                'New Loan',
  'add-broker':       'Add Broker',
  'add-customer':     'Add Customer',
  'loan-detail':      'Loan Detail',
  'customer-detail':  'Customer Detail',
  'broker-detail':    'Broker Detail',
  'payment-detail':   'Payment Detail',
  'pending-requests': 'Pending Requests',
  settings:           'Settings',
  'credit-score':     'Credit Score Board',
  'user-management':  'User Management',
};

// ── Navigation ────────────────────────────────────────────────────────────
export function navTo(page) {
  // Module visibility check — block navigation if user can't see the module
  const moduleMap = {
    'add':'loans', 'add-broker':'brokers', 'add-customer':'customers',
    'loan-detail':'loans', 'customer-detail':'customers', 'broker-detail':'brokers',
    'payment-detail':'interest-payments',
  };
  const modName = moduleMap[page] || page;
  if (window.canSeeModule && !window.canSeeModule(modName)) {
    window.showMsg?.('topbar-msg','You do not have access to this page.','err');
    return;
  }

  // Block "add" pages if user doesn't have add permission
  const addPages = {'add':'loans','add-broker':'brokers','add-customer':'customers'};
  if (addPages[page] && window.canDo && !window.canDo(addPages[page],'add')) {
    window.showMsg?.('topbar-msg','You do not have permission to add new records.','err');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = pageNames[page] || page;

  closeMob();
  window.scrollTo(0, 0);

  // Page-specific load/render calls via window.*
  if (page === 'projection')         window.renderProjection?.();
  if (page === 'brokers')            window.renderBrokers?.();
  if (page === 'calendar')           window.renderCalendar?.();
  if (page === 'settings')           { window.loadSettingsPage?.(); window.loadCompanyInfo?.(); window.applySettingsPermissions?.(); }
  if (page === 'pending-requests') {
    if (!window.isAdmin?.()) { navTo('dashboard'); return; }
    window.loadPendingRequests?.();
  }
  if (page === 'add')                { window.loadCustomers?.(); window.loadBrokers?.(); }
  if (page === 'customers')          { window.loadCustomers?.(); window.renderCustomersPage?.(); }
  if (page === 'add-broker')         { window.loadBrokers?.(); window.renderBrokerList?.(); }
  if (page === 'add-customer')       { window.loadCustomers?.(); window.loadBrokers?.(); }
  if (page === 'interest-payments')  window.loadInterestPaymentsPage?.();
  if (page === 'repayment-overview') window.loadRepaymentOverview?.();
  if (page === 'user-management')    window.loadCompanyUsers?.();
}

// ── Sidebar ───────────────────────────────────────────────────────────────
let sidebarCollapsed = false;

export function isMobile() {
  return window.innerWidth <= 900;
}

export function handleSidebarBtn() {
  if (isMobile()) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('mob-open')) closeMob();
    else openMob();
  } else {
    toggleSidebar();
  }
}

export function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed', sidebarCollapsed);
  const main = document.getElementById('main-content');
  if (main) main.style.marginLeft = sidebarCollapsed ? '64px' : '220px';
  document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  localStorage.setItem('sb_sidebar', sidebarCollapsed ? '1' : '0');
}

export function openMob() {
  document.getElementById('sidebar')?.classList.add('mob-open');
  document.getElementById('sidebar-overlay')?.classList.add('active');
  document.body.classList.add('mob-menu-open');
}

export function closeMob() {
  document.getElementById('sidebar')?.classList.remove('mob-open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
  document.body.classList.remove('mob-menu-open');
}

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main    = document.getElementById('main-content');
  const mobile = isMobile();
  document.body.classList.toggle('is-mobile', mobile);
  if (mobile) {
    if (main) main.style.marginLeft = '0';
    if (sidebar) sidebar.classList.remove('collapsed');
    sidebarCollapsed = false;
    document.body.classList.remove('sidebar-collapsed');
  } else {
    const saved = localStorage.getItem('sb_sidebar') === '1';
    sidebarCollapsed = saved;
    if (sidebar) sidebar.classList.toggle('collapsed', saved);
    if (main) main.style.marginLeft = saved ? '64px' : '220px';
    document.body.classList.toggle('sidebar-collapsed', saved);
  }
}

// Listen for window resize — handle transition between mobile/desktop layouts
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const mobile = isMobile();
    const wasOpen = document.getElementById('sidebar')?.classList.contains('mob-open');
    document.body.classList.toggle('is-mobile', mobile);

    if (!mobile && wasOpen) {
      // Close mobile menu when entering desktop layout
      closeMob();
    }

    // Re-apply sidebar layout
    initSidebar();
  }, 150);
});

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  navTo, handleSidebarBtn, toggleSidebar, openMob, closeMob, initSidebar, isMobile,
});
