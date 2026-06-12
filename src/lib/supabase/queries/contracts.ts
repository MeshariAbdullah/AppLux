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

// =====================================================================
// Handover photo persistence — see migration
// 20260502121100_handover_photo_persistence.sql
// =====================================================================

/** Bucket where handover photos live. Reuses damage-evidence under a
 *  scoped `handover/` prefix so we don't have to provision a new
 *  bucket; the migration adds storage policies that match this
 *  prefix specifically. */
export const HANDOVER_BUCKET = 'damage-evidence';
export const HANDOVER_PREFIX = 'handover';

/**
 * Upload the handover photo and record the resulting path on the
 * contract row via the record_contract_handover RPC. Returns the
 * storage object key on success.
 */
export async function uploadAndRecordHandover(input: {
  contractId: string;
  file: File;
}): Promise<string> {
  const sb = requireSupabase();
  const ext = (input.file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${HANDOVER_PREFIX}/${input.contractId}/${Date.now()}.${ext}`;
  const { error: uploadErr } = await sb.storage
    .from(HANDOVER_BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadErr) throw uploadErr;
  const { error: rpcErr } = await sb.rpc('record_contract_handover', {
    p_contract_id: input.contractId,
    p_photo_path: path,
  });
  if (rpcErr) throw rpcErr;
  return path;
}

/**
 * Resolve a handover photo path to a short-lived signed URL for
 * display. Returns null if the path is empty or the signed URL
 * couldn't be created.
 */
export async function getHandoverPhotoUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const sb = requireSupabase();
  const { data, error } = await sb.storage
    .from(HANDOVER_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
