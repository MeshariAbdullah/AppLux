import { requireSupabase } from '../client';
import type {
  MerchantApplicationInsert,
  MerchantApplicationRow,
  MerchantApplicationStatus,
} from '../types';

export async function submitMerchantApplication(
  payload: MerchantApplicationInsert,
): Promise<MerchantApplicationRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_applications')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lists applications. RLS scopes results automatically:
 *   * applicant sees only their own
 *   * admin sees all
 */
export async function listMerchantApplications(filter?: {
  status?: MerchantApplicationStatus;
  limit?: number;
}): Promise<MerchantApplicationRow[]> {
  const sb = requireSupabase();
  let q = sb.from('merchant_applications').select('*');
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('submitted_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------
// Admin pagination (performance-only). The admin list previously
// fetched every application; these two helpers page the SAME rows in
// the SAME visible order with no RPC/schema change.
//
// Ordering contract — must exactly reproduce the page's historical
// client-side sort ("pending first, then newest decision"):
//   decided_at DESC NULLS FIRST  → pending rows (decided_at IS NULL)
//                                  lead, decided rows newest-first
//   submitted_at DESC            → newest-first within the pending block
//   id ASC                       → stable tiebreak so pages never skip
//                                  or duplicate rows
// ---------------------------------------------------------------------

export type MerchantApplicationPage = {
  rows: MerchantApplicationRow[];
  /** Exact total for the CURRENT filter — drives the pager. */
  total: number;
};

export async function listMerchantApplicationsPage(input: {
  status?: MerchantApplicationStatus;
  /** 0-based page index. */
  page: number;
  pageSize: number;
}): Promise<MerchantApplicationPage> {
  const sb = requireSupabase();
  const from = input.page * input.pageSize;
  let q = sb.from('merchant_applications').select('*', { count: 'exact' });
  if (input.status) q = q.eq('status', input.status);
  q = q
    .order('decided_at', { ascending: false, nullsFirst: true })
    .order('submitted_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + input.pageSize - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

/** Exact per-status counts for the tab badges + hero — three HEAD
 *  count requests instead of loading every row. */
export async function countMerchantApplicationsByStatus(): Promise<
  Record<MerchantApplicationStatus, number>
> {
  const sb = requireSupabase();
  const statuses: MerchantApplicationStatus[] = ['pending', 'approved', 'rejected'];
  const results = await Promise.all(
    statuses.map((status) =>
      sb
        .from('merchant_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', status),
    ),
  );
  const out = { pending: 0, approved: 0, rejected: 0 };
  results.forEach((r, i) => {
    if (r.error) throw r.error;
    out[statuses[i]] = r.count ?? 0;
  });
  return out;
}

export async function fetchMerchantApplication(
  id: string,
): Promise<MerchantApplicationRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Admin-only: decide on a pending application.
 * RLS ensures only admins can perform this update.
 */
export async function decideMerchantApplication(
  id: string,
  decision: 'approved' | 'rejected',
  decisionNotes?: string,
): Promise<MerchantApplicationRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_applications')
    .update({
      status: decision,
      decision_notes: decisionNotes ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Admin-only: provision the actual merchant entity from an approved
 * application — creates the `merchants` row and lifts `profiles.role`
 * to 'merchant'. Backed by a SECURITY DEFINER Postgres function so the
 * two writes happen in a single transaction.
 *
 * Idempotent: calling twice for the same approved application returns
 * the existing merchant id without duplicating the row.
 */
export async function provisionMerchantFromApplication(
  applicationId: string,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('provision_merchant_from_application', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  return data as string;
}
