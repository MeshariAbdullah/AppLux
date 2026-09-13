// =====================================================================
// Session duration — 10-day policy + persistence/logout guarantees.
// Run: npm run test:session
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SESSION_MAX_DAYS,
  SESSION_POLICIES,
  resolveSessionPolicy,
} from './.session-policy-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

test('every role keeps its session for exactly 10 days (idle AND absolute)', () => {
  assert.equal(SESSION_MAX_DAYS, 10);
  for (const role of ['customer', 'merchant', 'admin']) {
    const p = SESSION_POLICIES[role];
    assert.equal(p.absoluteMs, TEN_DAYS_MS, `${role} absolute`);
    assert.equal(p.idleMs, TEN_DAYS_MS, `${role} idle`);
    assert.ok(p.warningMs > 0 && p.warningMs < p.idleMs, `${role} warning window`);
  }
  // Role still resolving → the customer policy, same 10 days.
  assert.equal(resolveSessionPolicy(null).absoluteMs, TEN_DAYS_MS);
});

test('sessions persist via the Supabase refresh token — no custom token storage', () => {
  const client = read('src/lib/supabase/client.ts');
  assert.ok(client.includes('persistSession: true'));
  assert.ok(client.includes('autoRefreshToken: true'));
  assert.ok(client.includes('storageKey: AUTH_STORAGE_KEY'));
  // The app writes no auth material of its own: the only auth keys the
  // storage module knows are the Supabase session key and the two
  // millisecond timer anchors. No password/OTP storage exists.
  const storage = read('src/lib/session/storage.ts');
  assert.ok(storage.includes("'lend.auth'"));
  assert.ok(storage.includes("'lend.session.startedAt'"));
  assert.ok(storage.includes("'lend.session.lastActivityAt'"));
  for (const forbidden of ['password', 'otp', 'challenge', 'refresh_token']) {
    assert.ok(
      !storage.toLowerCase().includes(forbidden),
      `storage module must not know about: ${forbidden}`,
    );
  }
});

test('logout sweeps every app key immediately, preserving only the locale', async () => {
  // storage.ts guards on `typeof window` — give Node a window with a
  // minimal Storage stand-in.
  const backing = new Map([
    ['lend.auth', '{"refresh_token":"x"}'],
    ['lend.session.startedAt', '123'],
    ['lend.session.lastActivityAt', '456'],
    ['lend:merchant-rental-session-draft:u1', '{}'],
    ['lend.push.install_id', 'abc'],
    ['applux.session', '{}'],
    ['applux.locale', 'en'],
    ['unrelated.other-app', 'keep-me'],
  ]);
  globalThis.window = {
    localStorage: {
      get length() {
        return backing.size;
      },
      key: (i) => [...backing.keys()][i] ?? null,
      getItem: (k) => (backing.has(k) ? backing.get(k) : null),
      setItem: (k, v) => backing.set(k, String(v)),
      removeItem: (k) => backing.delete(k),
    },
  };
  try {
    const { clearAppStorage } = await import('./.session-storage-bundle.mjs');
    clearAppStorage();
    assert.deepEqual(
      [...backing.keys()].sort(),
      ['applux.locale', 'unrelated.other-app'],
      'all lend.*/applux.* keys gone; locale + foreign keys survive',
    );
    assert.equal(backing.get('applux.locale'), 'en');
  } finally {
    delete globalThis.window;
  }
});

test('the sign-out path still revokes server-side and always sweeps', () => {
  const auth = read('src/lib/supabase/auth.ts');
  // Global sign-out first (revokes the refresh token), local fallback,
  // and the storage sweep + cache wipe in finally — expired or revoked
  // sessions can never linger on-device.
  assert.ok(auth.includes('sb.auth.signOut()'));
  assert.ok(auth.includes("sb.auth.signOut({ scope: 'local' })"));
  assert.ok(auth.includes('clearAppStorage()'));
  assert.ok(auth.includes('cacheClearAll()'));
});

test('foreground revalidation and the expired-session redirect are intact', () => {
  const hook = read('src/lib/session/useSessionTimeout.ts');
  // Coming back to the app re-checks the timers AND asks Supabase; a
  // dead session signs out with the "expired" notice, and RequireRole
  // redirects to the role's login on the auth flip.
  assert.ok(hook.includes('.getSession()'));
  assert.ok(hook.includes("performSignOut('expired')"));
  assert.ok(hook.includes("performSignOut('absolute')"));
  assert.ok(hook.includes("performSignOut('idle')"));
});
