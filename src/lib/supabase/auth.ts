import type { Session, User } from '@supabase/supabase-js';
import { requireSupabase } from './client';
import { clearAppStorage } from '@/lib/session/storage';
import { cacheClearAll } from '@/lib/cache/memoryCache';
import { clearEventBuffer, logEvent } from '@/lib/observability/log';

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  /** Canonical Saudi mobile (5XXXXXXXX). Required for renter lookups
   *  from the merchant session flow; the DB CHECK constraint enforces
   *  the canonical shape. */
  mobile: string;
  /** Saudi National ID (10 digits, starts with 1 or 2). Required at
   *  signup; persisted onto profiles.national_id by the
   *  handle_new_auth_user trigger (see
   *  20260502121900_persist_national_id_on_signup.sql). */
  nationalId: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export async function signUpWithPassword({
  email,
  password,
  fullName,
  mobile,
  nationalId,
}: SignUpInput): Promise<{ user: User | null; session: Session | null }> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, mobile, national_id: nationalId },
    },
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signInWithPassword({
  email,
  password,
}: SignInInput): Promise<{ user: User; session: Session }> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session || !data.user) {
    throw new Error('Sign-in succeeded but no session was returned.');
  }
  return { user: data.user, session: data.session };
}

/**
 * Phase 1 logout hardening. Two guarantees callers can rely on:
 *
 *   1. The LOCAL session always dies. When the global sign-out (which
 *      revokes the refresh token server-side) fails — offline, Supabase
 *      hiccup — we fall back to a local-scope sign-out instead of
 *      leaving the app authenticated. This function no longer throws
 *      on network failure.
 *   2. Storage is swept. Every app-owned localStorage key (`applux.*`,
 *      `lend.*`, locale preserved) is removed, so no token, demo
 *      profile, or session anchor survives a logout.
 */
export async function signOut(): Promise<void> {
  const sb = requireSupabase();
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  } catch (err) {
    logEvent('auth_failure', 'warn', { op: 'sign_out_global_fallback' }, err);
    try {
      await sb.auth.signOut({ scope: 'local' });
    } catch {
      // Storage-level failure — the sweep below still clears the
      // persisted session, which is what actually logs the app out.
    }
  } finally {
    clearAppStorage();
    // Memory cache dies with the session (Phase 3A). Runs here as well
    // as on the SIGNED_OUT event so a failed network sign-out (which
    // may not emit the event) still wipes cached rows. This covers the
    // session-timeout sign-out too — useSessionTimeout routes through
    // this function.
    cacheClearAll();
    // Observability ring buffer is session-scoped (Phase 6A).
    clearEventBuffer();
  }
}

/**
 * Kick off the forgot-password flow. Sends a one-time recovery email
 * to the address provided; the email link points at `redirectTo` and
 * carries the recovery token in the URL hash. Supabase's
 * `detectSessionInUrl: true` (set on the client in client.ts) parses
 * the hash on arrival and emits a PASSWORD_RECOVERY event on
 * onAuthStateChange — that's the cue for the reset-password page to
 * accept the new password.
 *
 * Always resolves successfully (no email-existence leak — Supabase
 * silently no-ops when the email doesn't match a user).
 */
export async function sendPasswordResetEmail({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/**
 * Updates the signed-in user's password. Used by the reset-password
 * page after the recovery link has established a session.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}
