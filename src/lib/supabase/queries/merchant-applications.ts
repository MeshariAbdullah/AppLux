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
 *
 * Note: this only updates the application row. Provisioning the actual
 * `merchants` row + lifting `profiles.role` is a Phase 3 concern (Edge
 * Function or RPC), not Phase 2.
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
