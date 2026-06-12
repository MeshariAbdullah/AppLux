import type { Session, User } from '@supabase/supabase-js';
import { requireSupabase } from './client';

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  /** Canonical Saudi mobile (5XXXXXXXX). Required for renter lookups
   *  from the merchant session flow; the DB CHECK constraint enforces
   *  the canonical shape. */
  mobile: string;
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
}: SignUpInput): Promise<{ user: User | null; session: Session | null }> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, mobile },
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

export async function signOut(): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
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
