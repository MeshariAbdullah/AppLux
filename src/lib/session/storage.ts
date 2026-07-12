// =====================================================================
// App-owned browser storage — single place that knows every key prefix
// the app writes. Phase 1 of the NFR hardening plan.
//
// IMPORTANT: this module must stay dependency-free. It is imported by
// src/lib/supabase/client.ts at module load (before createClient), so
// any import back into the supabase layer would be a cycle.
// =====================================================================

/** Supabase auth session (JWT) storage key — Lend brand. */
export const AUTH_STORAGE_KEY = 'lend.auth';

/** Pre-brand-refresh auth key. Migrated to AUTH_STORAGE_KEY at boot. */
export const LEGACY_AUTH_STORAGE_KEY = 'applux.auth';

/** Absolute-timeout anchor — set once per sign-in, cleared on sign-out. */
export const SESSION_STARTED_AT_KEY = 'lend.session.startedAt';

/** Idle-timeout anchor — last user interaction, throttled writes. */
export const LAST_ACTIVITY_AT_KEY = 'lend.session.lastActivityAt';

/** Every prefix the app owns. The sign-out sweep removes ALL keys under
 *  these prefixes and nothing else — unrelated browser storage is never
 *  touched. */
const APP_KEY_PREFIXES = ['applux.', 'lend.'] as const;

/** Locale preference key (src/lib/i18n.tsx). Deliberately SURVIVES the
 *  sign-out sweep: it holds a 2-letter language code (no PII), and
 *  wiping it would flip an English-preferring user back to Arabic on
 *  every logout. */
const LOCALE_KEY = 'applux.locale';

function storageOrNull(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // Storage can throw in locked-down webviews / private modes.
    return null;
  }
}

/**
 * One-time auth-key migration, run at module load BEFORE the Supabase
 * client is created:
 *
 *   * `applux.auth` exists and `lend.auth` doesn't → copy it over, so a
 *     currently signed-in user keeps their session across the rename.
 *   * `applux.auth` is removed afterwards in every case — the legacy
 *     key must not linger with a live refresh token in it.
 *
 * Idempotent; safe to call on every boot.
 */
export function migrateLegacyAuthStorage(): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    const legacy = storage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (legacy === null) return;
    if (storage.getItem(AUTH_STORAGE_KEY) === null) {
      storage.setItem(AUTH_STORAGE_KEY, legacy);
    }
    storage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // Never let a storage failure break boot — worst case the user
    // signs in again.
  }
}

/**
 * Sign-out sweep: removes every localStorage key under the app's
 * prefixes (`applux.*`, `lend.*`), preserving only the locale
 * preference. Called from the auth sign-out path so no session token,
 * demo profile, or cached anchor survives a logout.
 */
export function clearAppStorage(): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    const locale = storage.getItem(LOCALE_KEY);
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && APP_KEY_PREFIXES.some((p) => key.startsWith(p))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) storage.removeItem(key);
    if (locale !== null) storage.setItem(LOCALE_KEY, locale);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Read a millisecond timestamp anchor; null when absent/corrupt. */
export function readTimestamp(key: string): number | null {
  const storage = storageOrNull();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Persist a millisecond timestamp anchor. */
export function writeTimestamp(key: string, value: number): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    /* storage unavailable — timers still run in memory */
  }
}
