import { requireSupabase } from '../client';
import type { EligibilityBreakdown, RentalEligibilityRow } from '../types';

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
 * Merchant-context read of a renter's eligibility. RLS on
 * `rental_eligibility` blocks merchants from reading other users'
 * rows directly; this RPC is SECURITY DEFINER and gated on the
 * caller's role being merchant or admin, returning only the fields
 * the rental-session UI needs (no `notes`, `assigned_by`, or
 * `updated_at`). Returns null when there is no eligibility row for
 * the given renter.
 *
 * Used by `MerchantRentalSession.handleOperationContinue` after the
 * renter has been verified through `confirm_renter_presence`. For
 * self-loads (customer reading their own row) and admin loads use
 * `fetchEligibility` instead — both have direct table policies that
 * cover them.
 */
export async function fetchRenterEligibility(
  renterId: string,
): Promise<RentalEligibilityRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('get_renter_eligibility', {
    p_renter_id: renterId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  // The RPC returns a subset of the full RentalEligibilityRow shape.
  // Pad the rest with sentinel values so the rest of the app (which
  // types against the table row) doesn't crash on missing keys.
  // These fields are admin-only and aren't surfaced anywhere in the
  // merchant session UI.
  return {
    user_id: row.user_id,
    limit_amount: Number(row.limit_amount),
    used_amount: Number(row.used_amount),
    // Present once 20260502123600 is applied; undefined before that
    // (callers treat missing as 0 reserved).
    reserved_amount:
      row.reserved_amount === undefined ? undefined : Number(row.reserved_amount),
    available_amount:
      row.available_amount === undefined ? undefined : Number(row.available_amount),
    tier: row.tier,
    assigned_by: null,
    assigned_at: new Date(0).toISOString(),
    notes: null,
    updated_at: new Date(0).toISOString(),
  };
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

/**
 * Customer self-service eligibility breakdown (20260502123600):
 * limit / committed / reserved-for-pending-offers / available, all
 * computed server-side from authoritative data. Returns null when the
 * RPC is not available yet (migration unapplied) or no row exists —
 * callers fall back to the plain eligibility row with reserved = 0.
 */
export async function fetchMyEligibilityBreakdown(): Promise<EligibilityBreakdown | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('get_my_eligibility_breakdown');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    limit: Number(row.limit_amount),
    used: Number(row.used_amount),
    reserved: Number(row.reserved_amount),
    available: Number(row.available_amount),
    tier: row.tier,
  };
}
