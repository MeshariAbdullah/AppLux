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

export async function getCurrentSession(): Promise<Session | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}
