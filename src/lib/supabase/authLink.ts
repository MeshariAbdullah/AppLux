// =====================================================================
// Auth email-link hint capture.
//
// Supabase auth emails (invite, password recovery) redirect to the
// project's Site URL — the app root — with the link kind carried in
// the URL fragment (implicit flow: `type=invite` / `type=recovery`,
// or `error_code=...` for expired/used links). The supabase-js client
// (`detectSessionInUrl: true`) consumes the fragment and establishes
// a session, after which nothing in the URL says this arrival was an
// invite/recovery — so the router's role-based landing used to send
// the user straight to the homepage with no password form.
//
// This module runs BEFORE the client is created (imported first by
// client.ts): it snapshots the link kind synchronously into
// sessionStorage, where the router and the reset-password page read
// it. sessionStorage (not localStorage) on purpose: the hint is
// per-tab and dies with it, and it survives the in-app redirects on
// mobile Safari. Every storage access is try/catch-guarded — with
// storage unavailable the app degrades to the old behavior rather
// than crashing.
// =====================================================================

export type AuthLinkHint = {
  /** 'invite' | 'recovery' — the kinds that need a password form. */
  type?: string;
  /** Set for failed links (expired / already used). */
  errorCode?: string;
};

const STORE_KEY = 'lend.authLinkHint';

/** Kinds that must land on the set-password form. */
const PASSWORD_KINDS = new Set(['invite', 'recovery']);

/**
 * Snapshot the link kind from the current URL fragment. Must run
 * before supabase-js processes (and strips) the fragment. Idempotent;
 * a URL without auth parameters leaves any existing hint untouched.
 */
export function captureAuthLinkHint(): void {
  try {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    const params = new URLSearchParams(raw);
    const kind = params.get('type');
    const errorCode = params.get('error_code');
    if (kind && PASSWORD_KINDS.has(kind)) {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ type: kind }));
    } else if (errorCode) {
      // Expired or already-used link: Supabase redirects with
      // error/error_code in the fragment and no session is created.
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ errorCode }));
    }
  } catch {
    /* storage or URL API unavailable — degrade silently */
  }
}

/** Read the pending hint without clearing it. */
export function peekAuthLinkHint(): AuthLinkHint | null {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as AuthLinkHint) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the hint — called by the reset-password page once the flow
 * reaches a terminal state (password saved, or the invalid-link
 * screen was shown), so the next navigation behaves normally.
 */
export function clearAuthLinkHint(): void {
  try {
    window.sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Record the link kind directly — used by the /auth/confirm page after
 * it exchanges a token hash on explicit user interaction, so the
 * reset-password page shows the right copy and the router keeps
 * guarding against a homepage bypass until the password is set.
 */
export function recordLinkKind(kind: 'invite' | 'recovery'): void {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ type: kind }));
  } catch {
    /* degrade silently */
  }
}

/**
 * Belt-and-braces for flows where the fragment was not observable:
 * the auth provider records a recovery hint when supabase-js emits
 * its PASSWORD_RECOVERY event.
 */
export function recordRecoveryEvent(): void {
  try {
    if (!window.sessionStorage.getItem(STORE_KEY)) {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ type: 'recovery' }));
    }
  } catch {
    /* degrade silently */
  }
}
