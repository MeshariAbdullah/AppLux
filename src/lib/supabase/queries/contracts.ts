import { requireSupabase } from '../client';
import type { ContractStatusDB, RentalContractRow } from '../types';

export async function fetchContractById(
  id: string,
): Promise<RentalContractRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCustomerContracts(
  customerUserId: string,
  filter?: { status?: ContractStatusDB; limit?: number },
): Promise<RentalContractRow[]> {
  const sb = requireSupabase();
  let q = sb
    .from('rental_contracts')
    .select('*')
    .eq('customer_user_id', customerUserId);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('signed_at', { ascending: false, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listMerchantContracts(
  merchantId: string,
  filter?: { status?: ContractStatusDB; limit?: number },
): Promise<RentalContractRow[]> {
  const sb = requireSupabase();
  let q = sb.from('rental_contracts').select('*').eq('merchant_id', merchantId);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('end_date', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * End a rental contract (normal closure or post-damage closure).
 * RLS allows the merchant owner or admin to update.
 */
export async function endRentalContract(
  contractId: string,
  endedAt: string = new Date().toISOString(),
): Promise<RentalContractRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_contracts')
    .update({ status: 'ended', ended_at: endedAt })
    .eq('id', contractId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
