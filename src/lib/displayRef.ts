// =====================================================================
// Safe display references — the UI-facing guard against leaking
// internal database identifiers.
//
// Rule: end users only ever see FRIENDLY references (CN-2026-…,
// DC-2026-…, LND-…, MA-…). Raw UUIDs stay internal — routing params
// and API calls may carry them, but they must never be rendered as
// text. Any screen that prints a reference it did not format itself
// runs it through displayRef(), which refuses UUID-shaped values, so
// a data-plumbing mistake degrades to "no reference shown" instead of
// a UUID on a customer's screen.
// =====================================================================

const UUID_ANYWHERE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** True when the value is exactly one UUID (canonical 8-4-4-4-12). */
export function isUuid(value: string): boolean {
  return new RegExp(`^${UUID_ANYWHERE.source}$`, 'i').test(value.trim());
}

/**
 * Returns the value only when it is safe to show to a person:
 * non-empty and containing no UUID. Otherwise null — callers render
 * nothing (or their own fallback copy) instead of an internal id.
 */
export function displayRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || UUID_ANYWHERE.test(v)) return null;
  return v;
}
