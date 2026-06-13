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
