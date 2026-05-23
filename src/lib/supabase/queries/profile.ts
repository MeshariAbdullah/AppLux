import { requireSupabase } from '../client';
import type { AppRole, ProfileRow, ProfileUpdate } from '../types';

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
 * Look up a single profile by mobile number. Used by the merchant
 * rental session flow to verify a renter before starting operation
 * setup. Returns null when no match is found (callers should branch
 * into a "renter must complete account first" UX).
 *
 * Matching is case-insensitive at the DB level via citext-free `mobile`
 * comparison; we trim + collapse the value client-side to a canonical
 * `5XXXXXXXX` shape so leading-zero or country-code variants land on
 * the same row.
 */
export async function fetchProfileByMobile(
  mobile: string,
): Promise<ProfileRow | null> {
  const normalized = mobile.replace(/\D/g, '').replace(/^966/, '').replace(/^0/, '');
  if (!normalized) return null;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('mobile', normalized)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
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
