// ── auth.js ────────────────────────────────────────────────────────────────
// Authentication, company resolution, and screen management.
// Reads credentials from config.js. Reads/writes sb via window.sb.
// Reads/writes currentSchema and currentCompany via window.*.

import { SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAIL } from '/js/config.js';
import { dbFrom } from '/js/db.js';

const {createClient} = supabase;  // CDN-loaded global

// ── Screen management ─────────────────────────────────────────────────────
export function showScreen(n) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + n);
  if (el) el.classList.add('active');
  document.getElementById('main-app').style.display = 'none';
}

export function isAdmin() {
  return window.currentCompany?.role === 'admin';
}

export function applyRoleUI() {
  ['nav-pending-requests'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin() ? '' : 'none';
  });
  ['settings-db-connections-section'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin() ? '' : 'none';
  });
  if (!isAdmin()) {
    const prPage = document.getElementById('page-pending-requests');
    if (prPage && prPage.classList.contains('active')) window.navTo?.('dashboard');
  }
}

export async function launchApp() {
  setResolving(false);  // Reset guard — we've resolved successfully
  // Resolve current user's role from company_users table
  try {
    const session = await window.sb.auth.getSession();
    const userEmail = session?.data?.session?.user?.email;
    if (userEmail && window.currentSchema) {
      const { data: cuData } = await withTimeout(dbFrom('company_users').select('*').eq('email', userEmail.toLowerCase()).maybeSingle(), 8000, 'launchApp-company_users');
      if (cuData) {
        // User found in company_users — apply their role + custom permissions
        window.currentUserRecord = cuData;
        setUserPermissions(cuData.role, cuData.permissions || {});

        // If user is suspended, block access
        if (cuData.status === 'suspended') {
          showScreen('pending');
          const pEl = document.getElementById('pending-company-name');
          if (pEl) pEl.textContent = 'Your account has been suspended. Contact the company owner.';
          return;
        }

        // If user was "invited", mark as active on first login
        if (cuData.status === 'invited') {
          await dbFrom('company_users').update({ status: 'active', user_id: session.data.session.user.id }).eq('id', cuData.id);
        }
      } else {
        // User is the owner (registered the company) — no entry in company_users yet
        // Or first time: auto-create owner entry
        const isOwner = window.currentCompany?.email === userEmail;
        if (isOwner) {
          setUserPermissions('owner', {});
          // Auto-create owner entry if missing
          await withTimeout(
            dbFrom('company_users').upsert([{
              email: userEmail.toLowerCase(),
              full_name: window.currentCompany?.company_name + ' (Owner)',
              role: 'owner',
              status: 'active',
              user_id: session.data.session.user.id,
              permissions: {},
            }], { onConflict: 'email' }),
            8000, 'launchApp-owner-upsert'
          );
        } else {
          // Unknown user — not in company_users and not the owner
          setUserPermissions('viewer', {});
        }
      }
    } else {
      // No email or no schema — default to owner for the registrant
      setUserPermissions('owner', {});
    }
  } catch (e) {
    console.warn('User role resolution failed, defaulting to owner:', e);
    setUserPermissions('owner', {});
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('main-app').style.display = 'flex';
  window.initSidebar?.();
  const nameEl = document.getElementById('sidebar-company-name');
  if (nameEl) {
    if (window.currentCompany?.company_name && window.currentCompany.company_name !== 'Admin') {
      nameEl.textContent = window.currentCompany.company_name;
      nameEl.style.display = 'block';
    } else {
      nameEl.style.display = 'none';
    }
  }
  applyRoleUI();

  // Populate sidebar user info (visible to ALL roles including viewers)
  const userInfoEl = document.getElementById('sidebar-user-info');
  if (userInfoEl) {
    const email = window.currentCompany?.email || '';
    const role = window.currentUserRole || 'viewer';
    const roleBadge = {owner:'Owner',admin:'Admin',manager:'Manager',viewer:'Viewer'}[role] || role;
    userInfoEl.innerHTML = email
      ? '<span style="color:var(--text)">' + email.split('@')[0] + '</span><br><span style="color:var(--muted)">' + roleBadge + '</span>'
      : '';
  }

  // Populate topbar user element (V13.2)
  const email = window.currentCompany?.email || '';
  const role = window.currentUserRole || 'viewer';
  const roleBadge = {owner:'Owner',admin:'Admin',manager:'Manager',viewer:'Viewer'}[role] || role;
  const company = window.currentCompany?.company_name || '';
  const userName = email ? email.split('@')[0] : 'User';
  const avatar = document.getElementById('tb-avatar');
  const tbName = document.getElementById('tb-name');
  const tbRole = document.getElementById('tb-role');
  const menuCompany = document.getElementById('tb-menu-company');
  const menuEmail = document.getElementById('tb-menu-email');
  const menuRole = document.getElementById('tb-menu-role');
  if (avatar) avatar.textContent = userName.charAt(0).toUpperCase();
  if (tbName) tbName.textContent = userName;
  if (tbRole) tbRole.textContent = roleBadge;
  if (menuCompany) menuCompany.textContent = company;
  if (menuEmail) menuEmail.textContent = email;
  if (menuRole) menuRole.textContent = roleBadge;

  window.loadAll?.();
  applySidebarPermissions();
  window.applyUserTheme?.();
}

// ── Resolve invited user (not in registrations, but in a company's company_users) ──
async function resolveInvitedUser(email) {
  try {
    const sb = window.sb;
    // Get all approved company schemas
    const {data: regs} = await withTimeout(
      sb.from('registrations')
        .select('company_name, schema_name, status')
        .eq('status', 'approved')
        .not('schema_name', 'is', null),
      8000, 'resolveInvitedUser-regs'
    );

    if (!regs || !regs.length) return false;

    // Check each company's company_users table for this email
    for (const reg of regs) {
      try {
        const {data: cuData, error: cuErr} = await withTimeout(
          sb.schema(reg.schema_name)
            .from('company_users')
            .select('*')
            .eq('email', email.toLowerCase())
            .maybeSingle(),
          6000, 'resolveInvitedUser-' + reg.schema_name
        );

        if (cuData && !cuErr) {
          // Found the user in this company
          if (cuData.status === 'suspended') {
            showScreen('pending');
            const pEl = document.getElementById('pending-company-name');
            if (pEl) pEl.textContent = 'Your account has been suspended. Contact the company owner.';
            return true;  // return true to prevent further fallback
          }

          window.currentSchema = reg.schema_name;
          window.currentCompany = {
            company_name: reg.company_name,
            schema_name: reg.schema_name,
            status: 'approved',
            role: cuData.role || 'viewer',
            email: email,
          };
          return true;
        }
      } catch (e) {
        // Schema might not have company_users yet — skip
        continue;
      }
    }
    return false;
  } catch (e) {
    console.warn('resolveInvitedUser failed:', e);
    return false;
  }
}

// ── Company resolution ────────────────────────────────────────────────────
export async function resolveCompanyAndLaunch(user) {
  if (_resolving) {
    console.log('[auth] resolveCompanyAndLaunch already in progress, skipping');
    return;
  }
  setResolving(true);
  console.log('[auth] resolveCompanyAndLaunch START for', user.email);

  try {
    const sb = window.sb;

    // Admin bypass
    if (user.email === ADMIN_EMAIL) {
      window.currentSchema = null;
      window.currentCompany = {company_name:'Admin', schema_name:null, status:'approved', role:'admin', email:user.email};
      launchApp();
      return;
    }

    // Look up user's registration with detailed timing
    console.log('[auth] Starting registrations query for', user.email);
    const queryStart = performance.now();
    let data, error;
    try {
      const result = await withTimeout(
        sb.from('registrations')
          .select('id,company_name,status,admin_notes,schema_name')
          .eq('email', user.email)
          .order('submitted_at', {ascending:false})
          .limit(1)
          .maybeSingle(),
        15000, 'resolveCompany-registrations'
      );
      data = result.data;
      error = result.error;
      console.log('[auth] registrations query completed in', Math.round(performance.now() - queryStart), 'ms', { hasData: !!data, error: error?.message });
    } catch (timeoutErr) {
      console.error('[auth] registrations query failed after', Math.round(performance.now() - queryStart), 'ms:', timeoutErr.message);
      // Try a direct fetch as fallback to bypass any client-level issue
      console.log('[auth] Attempting direct fetch fallback...');
      const session = await sb.auth.getSession();
      const token = session?.data?.session?.access_token || '';
      const directRes = await fetch(SUPABASE_URL + '/rest/v1/registrations?select=id,company_name,status,admin_notes,schema_name&email=eq.' + encodeURIComponent(user.email) + '&order=submitted_at.desc&limit=1', {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.pgrst.object+json',
        },
      });
      if (directRes.ok) {
        data = await directRes.json();
        if (!data || (Array.isArray(data) && data.length === 0)) data = null;
        if (Array.isArray(data)) data = data[0];
        console.log('[auth] Direct fetch succeeded:', !!data);
        error = null;
      } else if (directRes.status === 406 || directRes.status === 404) {
        // 406 = single row format with 0 rows; treat as null
        data = null;
        error = null;
      } else {
        throw timeoutErr;
      }
    }

    // Handle error from query
    if (error) {
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        console.warn('registrations table not found — running in legacy mode');
        window.currentSchema = null;
        launchApp();
        return;
      }
      throw error;
    }

    // No registration found — try resolving as invited user
    if (!data) {
      console.log('[auth] No registration found for', user.email, '— checking company_users');
      const resolved = await resolveInvitedUser(user.email);
      if (resolved) {
        launchApp();
        return;
      }
      showScreen('pending');
      const pEl = document.getElementById('pending-company-name');
      if (pEl) pEl.textContent = 'No company account found for this email. Ask your company owner to add you via User Management.';
      return;
    }

    window.currentCompany = {
      company_name: data.company_name,
      schema_name:  data.schema_name,
      status:       data.status,
      role:         'owner',
      reg_id:       data.id,
      email:        user.email,
    };
    window.currentSchema = data.schema_name || null;

    if (data.status === 'approved') {
      if (!window.currentSchema) {
        showScreen('pending');
        const pEl = document.getElementById('pending-company-name');
        if (pEl) pEl.textContent = 'Your account is approved but workspace setup is incomplete. Please contact the administrator.';
        return;
      }
      launchApp();
      return;
    }

    if (data.status === 'pending') {
      document.getElementById('pending-company-name').textContent = 'Company: ' + data.company_name;
      showScreen('pending');
      return;
    }

    if (data.status === 'rejected' || data.status === 'suspended') {
      const notesEl = document.getElementById('rejected-notes');
      if (notesEl && data.admin_notes) notesEl.textContent = 'Reason: ' + data.admin_notes;
      showScreen('rejected');
      return;
    }

    showScreen('pending');

  } catch (e) {
    console.error('resolveCompanyAndLaunch error:', e.message);
    window.currentSchema = null;
    launchApp();
  } finally {
    setResolving(false);
    console.log('[auth] resolveCompanyAndLaunch END — guard released');
  }
}

// ── Setup screen ──────────────────────────────────────────────────────────
export function saveSetup() {
  let url = document.getElementById('setup-url').value.trim().replace(/\/$/, '');
  const key = document.getElementById('setup-key').value.trim();
  const err = document.getElementById('setup-err');
  if (!url || !key) { err.textContent = 'Both fields are required.'; return; }
  if (!url.startsWith('http')) url = 'https://' + url;
  if (!url.includes('supabase')) { err.textContent = 'URL must be a Supabase project URL (contains "supabase")'; return; }
  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  window.sb = createClient(url, key);
  err.textContent = '';
  showScreen('login');
}

export function resetSetup() {
  if (!confirm('This will clear all local data and sign you out. Continue?')) return;
  // Sign out from Supabase first
  try { window.sb?.auth?.signOut(); } catch(e) {}
  // Clear all localStorage and sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  // Clear any Supabase-specific cookies
  document.cookie.split(';').forEach(c => {
    const eq = c.indexOf('=');
    const name = eq > -1 ? c.substr(0, eq).trim() : c.trim();
    if (name.startsWith('sb-') || name.includes('supabase')) {
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    }
  });
  // Reload after a brief delay
  setTimeout(() => location.reload(), 200);
}

// ── Auth actions ──────────────────────────────────────────────────────────
export function goToRegister() {
  const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  window.location.href = base + 'landing.html';
}

export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-err');
  if (!email || !pass) { err.textContent = 'Enter email and password.'; return; }
  err.textContent = 'Signing in…';
  const {error} = await window.sb.auth.signInWithPassword({email, password: pass});
  if (error) {
    err.textContent = error.message.toLowerCase().includes('email not confirmed')
      ? 'Please check your email and click the confirmation link first.'
      : error.message;
  } else {
    err.textContent = '';
  }
}

export async function doLogout() {
  await window.sb.auth.signOut();
}

// ── Startup ───────────────────────────────────────────────────────────────
let _resolving = false;  // Guard against re-entrant resolveCompanyAndLaunch calls

// Wrap any promise with a timeout to prevent hangs
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('[' + (label||'operation') + '] timed out after ' + ms + 'ms')), ms))
  ]);
}
let _resolvingTimeout = null;  // Safety timer to auto-release guard if stuck

function setResolving(value) {
  _resolving = value;
  if (_resolvingTimeout) { clearTimeout(_resolvingTimeout); _resolvingTimeout = null; }
  if (value === true) {
    // Auto-release after 15 seconds to prevent permanent lockout
    _resolvingTimeout = setTimeout(() => {
      if (_resolving) {
        console.warn('[auth] _resolving auto-released after 15s timeout');
        _resolving = false;
      }
    }, 15000);
  }
}
let _isRecovery = false;  // Guard: PASSWORD_RECOVERY blocks SIGNED_IN

export async function startup() {
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;

  if (!url || !key || key.includes('%%') || key.length < 20) {
    showScreen('setup');
    return;
  }

  // If user just completed password reset, show success message on login screen
  if (sessionStorage.getItem('lendingos_password_reset')) {
    sessionStorage.removeItem('lendingos_password_reset');
    setTimeout(() => {
      const loginErr = document.getElementById('login-err');
      if (loginErr) {
        loginErr.textContent = 'Password reset successful. Please sign in with your new password.';
        loginErr.style.color = 'var(--success)';
      }
    }, 600);
  }

  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);

  window.sb = createClient(url, key);
  showScreen('login');

  // ── CHECK URL HASH FIRST for recovery/error tokens BEFORE any session work ──
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const hashError = hashParams.get('error_description');
  const hashType = hashParams.get('type');
  const hashAccessToken = hashParams.get('access_token');

  // If recovery token in hash, force show password reset form
  if (hashType === 'recovery' && hashAccessToken) {
    console.log('[auth] Recovery token detected — forcing password reset form');
    _isRecovery = true;
    _fpEmail = 'recovery';

    // Establish session from URL tokens, then show form
    const refreshToken = hashParams.get('refresh_token');
    (async () => {
      try {
        if (hashAccessToken && refreshToken) {
          console.log('[auth] Setting session manually from URL tokens');
          const { data, error } = await window.sb.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: refreshToken,
          });
          console.log('[auth] setSession result:', { hasSession: !!data?.session, error });
          if (error) console.error('[auth] setSession error:', error);
        }
      } catch (e) {
        console.error('[auth] setSession threw:', e);
      }

      // Clear URL hash so refresh doesn't trigger this again
      history.replaceState(null, '', window.location.pathname);

      showScreen('forgot-password');
      document.getElementById('fp-step-email').style.display = 'none';
      document.getElementById('fp-step-otp').style.display = 'none';
      document.getElementById('fp-step-password').style.display = 'block';
      document.getElementById('fp-new-pass').value = '';
      document.getElementById('fp-confirm-pass').value = '';
      document.getElementById('fp-pass-msg').textContent = '';
      document.getElementById('fp-new-pass').focus();
    })();
    return; // exit startup early — let the IIFE handle everything
  }

  if (hashError) {
    history.replaceState(null, '', window.location.pathname);
    if (hashError.includes('expired') || hashError.includes('invalid')) {
      showScreen('forgot-password');
      document.getElementById('fp-step-email').style.display = 'block';
      document.getElementById('fp-step-otp').style.display = 'none';
      document.getElementById('fp-step-password').style.display = 'none';
      document.getElementById('fp-email-msg').textContent = 'Reset link has expired. Please request a new one.';
      document.getElementById('fp-email-msg').style.color = 'var(--red)';
      return;
    }
  }

  // If hash contains a recovery token, set the flag BEFORE any session resolves
  if (hashType === 'recovery' && hashAccessToken) {
    _isRecovery = true;
    console.log('[auth] Recovery flow detected in URL hash');
  }

  // Register auth state listener BEFORE getSession to catch PASSWORD_RECOVERY
  window.sb.auth.onAuthStateChange(async (ev, sess) => {
    console.log('[auth] onAuthStateChange:', ev, 'isRecovery:', _isRecovery, 'fpEmail:', _fpEmail, 'urlHash:', window.location.hash);
    console.log('[auth] State change:', ev, '_isRecovery:', _isRecovery);
    if (ev === 'PASSWORD_RECOVERY' && sess?.user) {
      _fpEmail = sess.user.email || '';
      _isRecovery = true;
      showScreen('forgot-password');
      document.getElementById('fp-step-email').style.display = 'none';
      document.getElementById('fp-step-otp').style.display = 'none';
      document.getElementById('fp-step-password').style.display = 'block';
      document.getElementById('fp-new-pass').value = '';
      document.getElementById('fp-confirm-pass').value = '';
      document.getElementById('fp-pass-msg').textContent = '';
      document.getElementById('fp-new-pass').focus();
      return;
    }
    // Only resolve on actual sign-in events, NOT on token refreshes
    // TOKEN_REFRESHED and INITIAL_SESSION events shouldn't re-trigger the launch flow
    if (ev === 'TOKEN_REFRESHED') {
      console.log('[auth] Token refreshed, ignoring');
      return;
    }
    if (ev === 'INITIAL_SESSION') {
      console.log('[auth] Initial session detected, will be handled by startup');
      return;
    }
    if (ev === 'SIGNED_OUT') {
      _resolving = false;
      _isRecovery = false;
      _fpEmail = '';
      showScreen('login');
      return;
    }
    if (ev === 'SIGNED_IN' && sess?.user && !_resolving && !_fpEmail && !_isRecovery) {
      await resolveCompanyAndLaunch(sess.user);
    } else if (ev === 'SIGNED_IN' && _isRecovery) {
      // Recovery session — show the password form
      _fpEmail = sess.user?.email || '';
      showScreen('forgot-password');
      document.getElementById('fp-step-email').style.display = 'none';
      document.getElementById('fp-step-otp').style.display = 'none';
      document.getElementById('fp-step-password').style.display = 'block';
      document.getElementById('fp-new-pass').value = '';
      document.getElementById('fp-confirm-pass').value = '';
      document.getElementById('fp-pass-msg').textContent = '';
      document.getElementById('fp-new-pass').focus();
    }
  });

  // NOW check for existing session (after listener is registered)
  try {
    const {data:{session}} = await window.sb.auth.getSession();
    if (session && !_isRecovery) {
      await resolveCompanyAndLaunch(session.user);
    } else if (session && _isRecovery) {
      // Recovery session active — show password form
      _fpEmail = session.user?.email || '';
      showScreen('forgot-password');
      document.getElementById('fp-step-email').style.display = 'none';
      document.getElementById('fp-step-otp').style.display = 'none';
      document.getElementById('fp-step-password').style.display = 'block';
      document.getElementById('fp-new-pass').focus();
    }
  } catch(e) {
    document.getElementById('login-err').textContent = 'Network error: ' + e.message;
  }

  // Old onAuthStateChange replaced above — this is the original block to remove
  window.sb.auth.onAuthStateChange(async (ev, sess) => {
    if (ev === 'PASSWORD_RECOVERY' && sess?.user) {
      // User clicked the reset link in email — show new password form
      _fpEmail = sess.user.email || '';
      _isRecovery = true;
      showScreen('forgot-password');
      document.getElementById('fp-step-email').style.display = 'none';
      document.getElementById('fp-step-otp').style.display = 'none';
      document.getElementById('fp-step-password').style.display = 'block';
      document.getElementById('fp-new-pass').value = '';
      document.getElementById('fp-confirm-pass').value = '';
      document.getElementById('fp-pass-msg').textContent = '';
      document.getElementById('fp-new-pass').focus();
      return;
    }
    if (ev === 'SIGNED_IN' && sess?.user && !_resolving && !_fpEmail && !_isRecovery) await resolveCompanyAndLaunch(sess.user);
    if (ev === 'SIGNED_OUT') {
      window.currentCompany = null;
      window.currentSchema = null;
      showScreen('login');
    }
  });
}

// ── Forgot Password Flow ──────────────────────────────────────────────────
let _fpEmail = '';

export function showForgotPassword() {
  showScreen('forgot-password');
  document.getElementById('fp-step-email').style.display = 'block';
  document.getElementById('fp-step-otp').style.display = 'none';
  document.getElementById('fp-step-password').style.display = 'none';
  document.getElementById('fp-email').value = '';
  document.getElementById('fp-email-msg').textContent = '';
  _fpEmail = '';
}

export function backToLogin() {
  _fpEmail = '';
  _isRecovery = false;
  showScreen('login');
}

export async function sendResetOTP() {
  const email = document.getElementById('fp-email')?.value?.trim();
  if (!email) {
    document.getElementById('fp-email-msg').textContent = 'Please enter your email address.';
    document.getElementById('fp-email-msg').style.color = 'var(--red)';
    return;
  }

  document.getElementById('fp-email-msg').textContent = 'Sending reset link…';
  document.getElementById('fp-email-msg').style.color = 'var(--muted)';

  try {
    // Use resetPasswordForEmail — sends a link that creates a recovery session
    const appUrl = window.location.origin;
    const { error } = await window.sb.auth.resetPasswordForEmail(email, {
      redirectTo: appUrl,
    });

    if (error) throw error;

    _fpEmail = email;
    document.getElementById('fp-sent-email').textContent = email;
    document.getElementById('fp-step-email').style.display = 'none';
    document.getElementById('fp-step-otp').style.display = 'block';
    document.getElementById('fp-otp-msg').textContent = '';

  } catch (e) {
    // Show generic message for security (don't reveal if email exists)
    document.getElementById('fp-email-msg').textContent = 'If this email is registered, a reset link has been sent. Check your inbox.';
    document.getElementById('fp-email-msg').style.color = 'var(--success)';
    _fpEmail = email;
    document.getElementById('fp-sent-email').textContent = email;
    document.getElementById('fp-step-email').style.display = 'none';
    document.getElementById('fp-step-otp').style.display = 'block';
  }
}

export async function verifyResetOTP() {
  // This is no longer needed — the reset link handles verification
  // But keep it for the manual OTP fallback
  document.getElementById('fp-otp-msg').textContent = 'Please click the link in your email to verify. Once clicked, you will be redirected to set a new password.';
  document.getElementById('fp-otp-msg').style.color = 'var(--muted)';
}

export async function resetPasswordFinal() {
  const newPass = document.getElementById('fp-new-pass')?.value;
  const confirmPass = document.getElementById('fp-confirm-pass')?.value;

  if (!newPass || newPass.length < 8) {
    document.getElementById('fp-pass-msg').textContent = 'Password must be at least 8 characters.';
    document.getElementById('fp-pass-msg').style.color = 'var(--red)';
    return;
  }

  if (newPass !== confirmPass) {
    document.getElementById('fp-pass-msg').textContent = 'Passwords do not match.';
    document.getElementById('fp-pass-msg').style.color = 'var(--red)';
    return;
  }

  document.getElementById('fp-pass-msg').textContent = 'Updating password…';
  document.getElementById('fp-pass-msg').style.color = 'var(--muted)';

  try {
    console.log('[auth] resetPasswordFinal — calling updateUser directly');

    // Race updateUser against a 10s timeout so we don't hang forever
    const updatePromise = window.sb.auth.updateUser({ password: newPass });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please request a new reset link.')), 10000)
    );

    const result = await Promise.race([updatePromise, timeoutPromise]);
    console.log('[auth] updateUser result:', result);

    if (result.error) throw result.error;

    document.getElementById('fp-pass-msg').textContent = 'Password reset successful. Reloading…';
    document.getElementById('fp-pass-msg').style.color = 'var(--success)';

    // Sign out, clear all state, and reload page to ensure clean login screen
    setTimeout(async () => {
      try {
        await window.sb.auth.signOut();
      } catch (e) { console.warn('signOut error:', e); }
      // Set a flag in sessionStorage so we show the success message after reload
      sessionStorage.setItem('lendingos_password_reset', '1');
      // Reload to ensure clean state
      window.location.href = window.location.origin + window.location.pathname;
    }, 1500);

  } catch (e) {
    document.getElementById('fp-pass-msg').textContent = 'Error: ' + (e.message || 'Failed to reset password');
    document.getElementById('fp-pass-msg').style.color = 'var(--red)';
  }
}

// ── Expose to window ──────────────────────────────────────────────────────
Object.assign(window, {
  showScreen, isAdmin, applyRoleUI, launchApp,
  showForgotPassword, backToLogin, sendResetOTP, verifyResetOTP, resetPasswordFinal,
  resolveCompanyAndLaunch, saveSetup, resetSetup,
  goToRegister, doLogin, doLogout, startup,
});


// ── V13.2: Topbar User Menu ─────────────────────────────────────────────
function toggleTopbarUserMenu(e) {
  e?.stopPropagation();
  const menu = document.getElementById('topbar-user-menu');
  if (!menu) return;
  menu.classList.toggle('open');
}

function closeTopbarUserMenu() {
  document.getElementById('topbar-user-menu')?.classList.remove('open');
}

// Close on outside click
document.addEventListener('click', (e) => {
  const userEl = document.getElementById('topbar-user');
  if (userEl && !userEl.contains(e.target)) {
    closeTopbarUserMenu();
  }
});

window.toggleTopbarUserMenu = toggleTopbarUserMenu;
window.closeTopbarUserMenu = closeTopbarUserMenu;
