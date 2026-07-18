import { requireSupabase } from '../client';
import type { ContractReceiptPhotoRow } from '../types';

// =====================================================================
// Item receipt photos (Bugs 17/19) — see migration
// 20260502122900_contract_receipt_photos.sql
//
// The customer captures 1–4 photos of the item INSIDE the guided
// acceptance flow, right after approving the offer + contract. All
// writes go through customer-only SECURITY DEFINER RPCs (the table has
// no client write policies), and activation is blocked server-side
// until confirm_contract_receipt_photos has run.
//
// Privacy: the bucket is private. Display always goes through
// short-lived signed URLs — storage paths and public URLs are never
// rendered.
// =====================================================================

/** Same private bucket as damage evidence + handover photos; receipt
 *  photos live under their own policy-scoped prefix. */
export const RECEIPT_BUCKET = 'damage-evidence';
export const RECEIPT_PREFIX = 'receipts';

/** Hard product limits (mirrored server-side by P0055/P0057). */
export const RECEIPT_MIN_PHOTOS = 1;
export const RECEIPT_MAX_PHOTOS = 4;

export async function listContractReceiptPhotos(
  contractId: string,
): Promise<ContractReceiptPhotoRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('contract_receipt_photos')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Upload one receipt image to the policy-scoped prefix and register it
 * on the contract via add_contract_receipt_photo. If the RPC rejects
 * (cap reached, locked, not the owner), the freshly uploaded object is
 * best-effort removed so no orphan blocks a retry.
 */
export async function uploadContractReceiptPhoto(input: {
  contractId: string;
  file: File;
}): Promise<ContractReceiptPhotoRow> {
  const sb = requireSupabase();
  const ext = (input.file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${RECEIPT_PREFIX}/${input.contractId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error: uploadErr } = await sb.storage
    .from(RECEIPT_BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadErr) throw uploadErr;

  const { data: photoId, error: rpcErr } = await sb.rpc(
    'add_contract_receipt_photo',
    { p_contract_id: input.contractId, p_storage_path: path },
  );
  if (rpcErr) {
    await sb.storage.from(RECEIPT_BUCKET).remove([path]).catch(() => {});
    throw rpcErr;
  }
  return {
    id: String(photoId),
    contract_id: input.contractId,
    uploaded_by: '',
    storage_path: path,
    created_at: new Date().toISOString(),
  };
}

/**
 * Remove one not-yet-confirmed photo: row first (the RPC enforces
 * ownership + the lock), then the storage object (policy re-checks the
 * lock server-side; failures are best-effort — an orphaned object can
 * never resurface because the row is gone).
 */
export async function removeContractReceiptPhoto(
  photo: Pick<ContractReceiptPhotoRow, 'id' | 'storage_path'>,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('remove_contract_receipt_photo', {
    p_photo_id: photo.id,
  });
  if (error) throw error;
  await sb.storage
    .from(RECEIPT_BUCKET)
    .remove([photo.storage_path])
    .catch(() => {});
}

/**
 * Confirm the uploaded photos — locks them permanently and unblocks
 * activation. Idempotent server-side (a repeat call returns the
 * original confirmation timestamp; no duplicate side effects).
 */
export async function confirmContractReceiptPhotos(
  contractId: string,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('confirm_contract_receipt_photos', {
    p_contract_id: contractId,
  });
  if (error) throw error;
  return String(data);
}

/**
 * Resolve a receipt photo to a short-lived signed URL for display.
 * Never expose the raw storage path in the UI.
 */
export async function getReceiptPhotoUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const sb = requireSupabase();
  const { data, error } = await sb.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
