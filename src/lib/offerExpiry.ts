// =====================================================================
// Offer expiry — THE shared client helper (20260502123800).
//
// Rules it encodes:
//   * only the PERSISTED rental_invoices.expires_at counts — never
//     issued_at / created_at / any formatted-string fallback;
//   * expired means now() >= expires_at (timestamp comparison);
//   * a missing expires_at (pre-migration data) yields NEITHER a
//     "valid until" hint NOR fake "expired" copy — callers render a
//     neutral state and the server stays authoritative.
//
// Display: Saudi-style date/time with ENGLISH numerals in Arabic
// (ar-EG-u-nu-latn keeps Arabic month names + Latin digits), Gregorian
// with the م suffix, and explicit 12-hour م/ص — e.g.
//   "27 يوليو 2026م، 11:45 م"  /  "27 July 2026, 11:45 PM"
// =====================================================================

export function isOfferExpired(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!expiresAt) return false; // unknown ≠ expired — server decides
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && nowMs >= t;
}

/** "صالح حتى" timestamp label, or null when no real expiry exists. */
export function formatValidUntil(
  expiresAt: string | null | undefined,
  locale: 'ar' | 'en',
): string | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;

  if (locale === 'ar') {
    const date = d.toLocaleDateString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString('ar-EG-u-nu-latn', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    // ar-EG renders the daypart as ص/م already; normalise spacing.
    return `${date}م، ${time}`;
  }
  const date = d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}, ${time.toUpperCase()}`;
}
