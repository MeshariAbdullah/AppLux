import { requireSupabase } from '../client';
import type { RentalEligibilityRow } from '../types';

export async function fetchEligibility(
  userId: string,
): Promise<RentalEligibilityRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_eligibility')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Admin: bulk fetch eligibility rows for many users (RLS allows admin select-all).
 * Returns a map keyed by user_id for O(1) lookups across a list page.
 */
export async function fetchEligibilityByUserIds(
  ids: string[],
): Promise<Map<string, RentalEligibilityRow>> {
  const map = new Map<string, RentalEligibilityRow>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_eligibility')
    .select('*')
    .in('user_id', unique);
  if (error) throw error;
  for (const e of data ?? []) map.set(e.user_id, e);
  return map;
}
