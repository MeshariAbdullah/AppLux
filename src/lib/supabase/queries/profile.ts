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
 * Admin: list all profiles, optionally filtered by role.
 */
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
