import { requireSupabase } from '../client';
import type { AppRole, ProfileRow, ProfileUpdate } from '../types';
import { normalizeMobile } from '@/lib/mobile';

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<ProfileRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch many profiles by id in one round-trip. Returns a map keyed by id
 * so callers can do O(1) name/initials lookups across a list.
 */
export async function fetchProfilesByIds(
  ids: string[],
): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .in('id', unique);
  if (error) throw error;
  for (const p of data ?? []) map.set(p.id, p);
  return map;
}

/**
 * Privileged lookup of a profile by mobile number. The merchant
 * rental session flow does NOT call this directly — it goes through
 * lookup_renter_by_mobile RPC (existence-only) and otp-verify edge
 * function (full identity, only after OTP succeeds).
 *
 * Reserved for admin / server contexts that already have permission
 * to read the row under RLS.
 */
export async function fetchProfileByMobile(
  mobile: string,
): Promise<ProfileRow | null> {
  const n = normalizeMobile(mobile);
  if (!n) return null;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('mobile', n.canonical)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
/**
 * App Store readiness — request soft-deletion of the caller's account.
 * Wraps the SECURITY DEFINER RPC; the DB validates that the caller is
 * authenticated and a 'customer' (merchants/admins go through
 * back-office offboarding instead). Idempotent — calling on an
 * already-pending profile leaves the original timestamp intact.
 *
 * After this resolves the caller should sign out — their account_status
 * is now 'suspended' for the grace window.
 */
export async function requestAccountDeletion(): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('request_account_deletion');
  if (error) throw error;
}

/** Reverts a pending deletion request during the grace window. */
export async function cancelAccountDeletion(): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('cancel_account_deletion');
  if (error) throw error;
}

export async function listProfiles(filter?: {
  role?: AppRole;
  limit?: number;
}): Promise<ProfileRow[]> {
  const sb = requireSupabase();
  let q = sb.from('profiles').select('*');
  if (filter?.role) q = q.eq('role', filter.role);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
