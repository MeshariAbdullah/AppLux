import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Vite injects these at build time. Either both are present (real backend)
// or both are missing (demo mode — fall back to localStorage store).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

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
