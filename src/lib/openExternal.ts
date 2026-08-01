// =====================================================================
// openExternalUrl — the one safe way to open an external link from the
// app (web + Capacitor iOS WKWebView). Mirrors the pattern used in
// Profile.tsx: a new tab with noopener,noreferrer so the opened page
// can't reach back into the app via window.opener. Only http(s) URLs are
// ever opened — javascript:/data: and other schemes are refused.
// =====================================================================

export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Open an external URL safely, or no-op if the URL is unsafe/absent. */
export function openExternalUrl(url: string | null | undefined): void {
  if (!isSafeHttpUrl(url)) return;
  // On Capacitor iOS this opens the system browser via the WKWebView's
  // default handling; on web it opens a new tab. noopener,noreferrer is
  // the safe default in both.
  window.open(url as string, '_blank', 'noopener,noreferrer');
}
