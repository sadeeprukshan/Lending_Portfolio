// ── db.js ──────────────────────────────────────────────────────────────────
// Supabase client routing layer.
//
// dbFrom(table) is the schema-aware query helper used everywhere in the app.
// When currentSchema is set (after company login), queries route to that
// company's private schema. Otherwise they hit the public schema.
//
// We read sb and currentSchema from window.* at call time (not import time)
// because:
// 1. sb is initialised inside window.onload after URL/key are resolved
// 2. currentSchema changes during the session as users log in/out
//
// The window-bridge pattern lets db.js be imported anywhere without
// worrying about initialisation order.

export function dbFrom(table) {
  const sb = window.sb;
  if (!sb) {
    console.error('[db.js] dbFrom called before sb initialised');
    return null;
  }
  const schema = window.currentSchema;
  if (schema) {
    return sb.schema(schema).from(table);
  }
  return sb.from(table);
}

// Optional: setters that keep window in sync if you ever need to mutate
// currentSchema from outside the main script
export function setSchema(s) {
  window.currentSchema = s || null;
}
