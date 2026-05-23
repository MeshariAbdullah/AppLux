import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// =====================================================================
// Supabase "configured" detection.
//
// `import.meta.env.VITE_*` is inlined by Vite AT BUILD TIME — never read
// at runtime in the deployed bundle. That means a Netlify (or any other)
// deploy is configured only if both env vars were present in the build
// environment when `npm run build` ran. Cached builds do NOT pick up
// env-var changes; trigger a fresh deploy after editing Site settings →
// Build & deploy → Environment.
//
// Common Netlify gotchas this guards against:
//   - Var set with leading/trailing whitespace or quotes
//   - Var set to the literal placeholder string "undefined" / "null"
//   - Var set in the wrong deploy context (Production vs Branch deploy)
//   - URL set to something that isn't actually an http(s) URL
//
// The boot-time `console.info('[applux] supabase config', …)` line below
// makes the detection observable from any deployed environment — open
// DevTools on the deployed site and you'll see exactly whether the vars
// reached the build, without leaking the anon key.
// =====================================================================

function readEnv(key: string): string | undefined {
  const raw = (import.meta.env as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return undefined;
  // Tolerate accidental whitespace and quote wrapping that the Netlify
  // UI sometimes adds when values are pasted from spreadsheets.
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed === 'undefined' || trimmed === 'null') return undefined;
  return trimmed;
}

const url = readEnv('VITE_SUPABASE_URL');
const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');

// A real Supabase URL is an http(s) URL. A real anon key is a JWT,
// which is always longer than 20 characters. These checks turn obvious
// misconfigurations (a bare project ref, a placeholder, etc.) into a
// clean "not configured" rather than a runtime crash later.
const urlLooksReal = !!url && /^https?:\/\/[^\s]+$/i.test(url);
const keyLooksReal = !!anonKey && anonKey.length >= 20;

export const supabaseConfigured = urlLooksReal && keyLooksReal;

let client: SupabaseClient<Database> | null = null;

if (supabaseConfigured) {
  client = createClient<Database>(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'applux.auth',
    },
  });
}

// ---------------------------------------------------------------------
// Debuggable boot diagnostics — visible in production DevTools.
//
// We log a single structured line at INFO and stash the same payload on
// `window.__APPLUX_ENV__` so the user can copy/paste it when reporting
// "the deploy is in demo mode". The URL host is safe to log (it's in
// every network request anyway); the anon key value is never logged.
// ---------------------------------------------------------------------
const diagnostics = {
  supabaseConfigured,
  urlPresent: typeof url === 'string',
  urlLooksReal,
  urlHost: urlLooksReal ? safeHost(url!) : null,
  keyPresent: typeof anonKey === 'string',
  keyLooksReal,
  keyLength: anonKey?.length ?? 0,
  mode: import.meta.env.MODE,
  dev: import.meta.env.DEV,
  prod: import.meta.env.PROD,
};

function safeHost(u: string): string | null {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __APPLUX_ENV__: typeof diagnostics }).__APPLUX_ENV__ =
    diagnostics;
}

// eslint-disable-next-line no-console
console.info('[applux] supabase config', diagnostics);

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[applux] Supabase is NOT configured for this build. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify ' +
      '(Site settings → Build & deploy → Environment) and trigger a ' +
      'fresh deploy. Inspect window.__APPLUX_ENV__ for detection details.',
  );
}

/**
 * Returns the Supabase client when env is configured, otherwise null.
 * Callers should handle the null case by falling back to demo data.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  return client;
}

/**
 * Returns the Supabase client or throws — use in code paths that have
 * already gated on `supabaseConfigured` and require the client.
 */
export function requireSupabase(): SupabaseClient<Database> {
  if (!client) {
    throw new Error(
      'Supabase client requested but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
        'Inspect window.__APPLUX_ENV__ in DevTools to see what the build detected.',
    );
  }
  return client;
}
