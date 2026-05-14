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
 * Close a rental contract through the lifecycle RPC. Idempotent. Atomically:
 *   1. flips the contract to status='ended' with ended_at=now()
 *   2. decrements rental_eligibility.used_amount by the contract total
 *   3. settles the linked promissory note when no live damage cases exist
 *
 * Damage-driven closure happens automatically via the AFTER INSERT trigger
 * on damage_cases (steps 1 + 2; note stays open as security for the claim).
 */
export async function closeRentalContract(contractId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('close_rental_contract', {
    p_contract_id: contractId,
  });
  if (error) throw error;
}
