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
