import { requireSupabase } from '../client';
import type { MerchantRow, RentalCategoryDB } from '../types';

export type ListMerchantsFilter = {
  category?: RentalCategoryDB;
  city?: string;
  verifiedOnly?: boolean;
  search?: string;
  limit?: number;
};

/**
 * List active partner boutiques. RLS ensures only `status = 'active'`
 * rows are returned to anonymous / customer roles.
 */
export async function listMerchants(
  filter: ListMerchantsFilter = {},
): Promise<MerchantRow[]> {
  const sb = requireSupabase();
  let q = sb.from('merchants').select('*').eq('status', 'active');

  if (filter.category) q = q.eq('primary_category', filter.category);
  if (filter.city) q = q.eq('city', filter.city);
  if (filter.verifiedOnly) q = q.eq('verified', true);
  if (filter.search) {
    // Search across the localized display_name jsonb (ar + en)
    q = q.or(
      `display_name->>ar.ilike.%${filter.search}%,display_name->>en.ilike.%${filter.search}%,company_name.ilike.%${filter.search}%`,
    );
  }
  if (filter.limit) q = q.limit(filter.limit);

  q = q.order('verified', { ascending: false }).order('rating', { ascending: false });

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Bulk lookup for resolving merchant_id → display row. Used by the
 * customer dashboard / contracts screen so rows can show the boutique
 * name instead of a dash. RLS allows authenticated reads on
 * `merchants` with status='active'; rows that don't match are simply
 * omitted (callers should handle missing ids gracefully).
 */
export async function fetchMerchantsByIds(
  ids: string[],
): Promise<MerchantRow[]> {
  if (ids.length === 0) return [];
  const sb = requireSupabase();
  const unique = Array.from(new Set(ids));
  const { data, error } = await sb
    .from('merchants')
    .select('*')
    .in('id', unique);
  if (error) throw error;
  return data ?? [];
}

export async function fetchMerchant(id: string): Promise<MerchantRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchants')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Fetch the merchant record owned by the current authenticated user.
 * Used by the merchant operational screens to discover their merchant id.
 */
// Design D1: the merchant profile page shows the branch count. RLS
// merchant_branches_owner_all scopes the read to the caller's own
// merchant; admins pass via their policy.
/** Pickup-branch info for customer-facing rental surfaces. Readable
 *  by anyone for ACTIVE merchants via merchant_branches_public_select
 *  (20260502120200) — no RLS change involved. */
export type BranchInfo = {
  id: string;
  name: { ar?: string; en?: string } | null;
  city: string;
  address: { ar?: string; en?: string } | null;
  /** Operating hours ('HH:MM:SS' time or null) — surfaced in the
   *  rental-period contract clause when both are set. */
  hours_open: string | null;
  hours_close: string | null;
  phone: string | null;
  /** Google Maps location link (null for legacy branches). */
  map_url: string | null;
};

const BRANCH_COLS = 'id, name, city, address, phone, hours_open, hours_close, map_url';

export async function fetchBranchById(id: string): Promise<BranchInfo | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_branches')
    .select(BRANCH_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as BranchInfo | null) ?? null;
}

/** All public branches of a merchant (active merchants only, via RLS),
 *  ordered primary-first. Includes phone + map_url for the store page. */
export async function listMerchantBranches(
  merchantId: string,
): Promise<BranchInfo[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_branches')
    .select(BRANCH_COLS)
    .eq('merchant_id', merchantId)
    .order('is_primary', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BranchInfo[];
}

/** All activity categories of a merchant (active merchants only, via
 *  merchant_activities_public_select). */
export async function listMerchantActivities(
  merchantId: string,
): Promise<RentalCategoryDB[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_activities')
    .select('category, position')
    .eq('merchant_id', merchantId)
    .order('position', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<{ category: RentalCategoryDB }>).map((r) => r.category);
}

/** Activities for many merchants at once (discovery list) → map keyed by
 *  merchant_id, each ordered by position. One IN() query. */
export async function listActivitiesForMerchants(
  merchantIds: string[],
): Promise<Record<string, RentalCategoryDB[]>> {
  if (merchantIds.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_activities')
    .select('merchant_id, category, position')
    .in('merchant_id', merchantIds)
    .order('position', { ascending: true });
  if (error) throw error;
  const map: Record<string, RentalCategoryDB[]> = {};
  for (const r of (data ?? []) as Array<{ merchant_id: string; category: RentalCategoryDB }>) {
    (map[r.merchant_id] ??= []).push(r.category);
  }
  return map;
}

export async function fetchMyMerchant(
  userId: string,
): Promise<MerchantRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchants')
    .select('*')
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
