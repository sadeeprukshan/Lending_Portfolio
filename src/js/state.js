// ── state.js ──────────────────────────────────────────────────────────────
// Shared mutable app state.
//
// All state lives on window.* so any module or inline code can read/write it.
// Import the getter functions for cleaner access in future modules.
// Import the setter functions when you need to update state (they sync to window).

// ── Initialise state on window ──────────────────────────────────────────────
window.allLoans     = window.allLoans     || [];
window.allBrokers   = window.allBrokers   || [];
window.allCustomers = window.allCustomers || [];
window.allPayments  = window.allPayments  || [];
window.currentCompany = window.currentCompany || null;

// ── Getters — for future clean imports ──────────────────────────────────────
export function getAllLoans()     { return window.allLoans; }
export function getAllBrokers()   { return window.allBrokers; }
export function getAllCustomers() { return window.allCustomers; }
export function getAllPayments()  { return window.allPayments; }
export function getCurrentCompany() { return window.currentCompany; }

// ── Setters — update state + sync to window ─────────────────────────────────
export function setLoans(data)       { window.allLoans     = data || []; }
export function setBrokers(data)     { window.allBrokers   = data || []; }
export function setCustomers(data)   { window.allCustomers = data || []; }
export function setPayments(data)    { window.allPayments  = data || []; }
export function setCurrentCompany(c) { window.currentCompany = c; }
