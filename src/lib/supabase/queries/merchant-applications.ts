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
