// =====================================================================
// getInitials — single source for first-letter initials.
// =====================================================================
// The exact behavior used to be inlined in 9 places (Phase 1 audit).
// Extracted verbatim — no semantic change:
//   1. Split on any whitespace run
//   2. Take the first two tokens
//   3. First character of each, upper-cased
//   4. If the result is empty (empty input, or tokens with no first
//      char), return the fallback string (default em-dash '—')
//
// `adapters.ts` deliberately keeps its own `deriveTextInitials` that
// falls back to `text.slice(0, 2)` instead — different semantic,
// don't unify.
// =====================================================================

export function getInitials(name: string | null | undefined, fallback = '—'): string {
  const safe = (name ?? '').trim();
  if (!safe) return fallback;
  const result = safe
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return result || fallback;
}
