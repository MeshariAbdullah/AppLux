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

/**
 * Admin: set / update a customer's eligibility (limit_amount + optional
 * tier / notes). Backed by an upsert keyed on user_id so the same call
 * handles both "first time we set a limit" and "admin is adjusting an
 * existing one". RLS policy `rental_eligibility_admin_all` allows this.
 *
 * The `updated_at` column is touched server-side via the table's
 * default — no need to set it from the client.
 */
export type UpsertEligibilityInput = {
  user_id: string;
  limit_amount: number;
  tier?: RentalEligibilityRow['tier'];
  notes?: string | null;
};

export async function upsertEligibility(
  input: UpsertEligibilityInput,
): Promise<RentalEligibilityRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_eligibility')
    .upsert(
      {
        user_id: input.user_id,
        limit_amount: input.limit_amount,
        ...(input.tier !== undefined ? { tier: input.tier } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
