import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Vite injects these at build time. Either both are present (real backend)
// or both are missing (demo mode — fall back to localStorage store).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// =====================================================================
// Demo mode — explicit, env-gated. The renter platform must NEVER show
// seeded demo records on top of a real Supabase project, because users
// would see fake invoices/contracts flash before the real data arrives.
//
// Truth table:
//   VITE_DEMO_MODE=true             → demo ON  (regardless of env)
//   PROD + !configured              → demo OFF (production safety;
//                                              ProductionConfigGuard
//                                              surfaces the misconfig)
//   DEV + !configured + no override → demo ON  (preserves the
//                                              local-dev workflow)
//   configured + no override        → demo OFF (live data only)
//
// `isDemoMode()` is the single source of truth — the StoreProvider
// uses it to decide whether to expose SEED_* arrays or empty values.
// =====================================================================

const VITE_DEMO_MODE_OVERRIDE =
  (import.meta.env.VITE_DEMO_MODE as string | undefined) === 'true';

export function isDemoMode(): boolean {
  if (VITE_DEMO_MODE_OVERRIDE) return true;
  if (import.meta.env.PROD) return false;
  return !supabaseConfigured;
}

/** Stable snapshot — module-level so hooks/selectors don't re-evaluate it. */
export const demoMode: boolean = isDemoMode();

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
} else if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    '[applux] Supabase env not set — running in demo mode. Copy .env.example to .env.local to enable the real backend.',
  );
} else {
  // PRODUCTION-VISIBLE diagnostic. Fires at module load on any deployed
  // build where Vite did not inline VITE_SUPABASE_URL /
  // VITE_SUPABASE_ANON_KEY. Without this, the misconfiguration is
  // silent: the login screens fall through to the demo path, the user
  // "logs in" without a real Supabase session, then the merchant
  // session handlers hit `if (!supabaseAuth.configured)` and surface
  // the generic "backendRequired" copy. This warning is the single
  // signal that points operators straight at the Vercel env-var fix.
  // No product logic is gated on this — the configured check on line
  // above is unchanged.
  // eslint-disable-next-line no-console
  console.warn(
    '[applux] Supabase env vars not inlined in this build. ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were undefined at `vite build` time, ' +
      'so the client falls back to the demo path and the merchant session ' +
      'flow will surface "backendRequired". ' +
      'Fix: Vercel → Project → Settings → Environment Variables, set both vars ' +
      'for the Production environment, then Deployments → Redeploy with ' +
      '"Use existing Build Cache" UNCHECKED.',
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
      'Supabase client requested but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.',
    );
  }
  return client;
}
