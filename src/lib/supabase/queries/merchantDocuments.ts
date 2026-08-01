import { getSupabase, requireSupabase } from '../client';
import type { MerchantDocumentRow } from '../types';

const DOCUMENTS_BUCKET = 'merchant-documents';

// =====================================================================
// Merchant onboarding document upload — client side of the quarantine
// flow. The wizard is anonymous, so the file goes to the controlled
// `merchant-doc-upload` Edge Function (service role), which validates it
// and returns an OPAQUE single-use receipt. The wizard carries only that
// receipt into signUp; the trusted signup trigger claims it. The raw
// storage path / bucket / token internals never reach the browser.
// =====================================================================

export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const ACCEPTED_DOC_EXT = '.pdf,.jpg,.jpeg,.png';

export type DocUploadResult = { receipt: string; fileName: string; size: number };

/** Discriminated failure so the UI can show the right friendly copy —
 *  never a raw Storage/Edge error. */
export type DocUploadError =
  | 'unsupported_type'
  | 'file_too_large'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export class MerchantDocUploadError extends Error {
  kind: DocUploadError;
  constructor(kind: DocUploadError) {
    super(kind);
    this.kind = kind;
  }
}

/** Client-side pre-check mirroring the server so obvious problems fail
 *  instantly without a round-trip. The SERVER remains authoritative. */
export function validateDocFile(file: File): DocUploadError | null {
  if (file.size <= 0 || file.size > MAX_DOC_BYTES) return 'file_too_large';
  if (!ACCEPTED_DOC_MIME.includes(file.type)) return 'unsupported_type';
  return null;
}

export async function uploadMerchantDocument(
  file: File,
  opts: { replaceReceipt?: string | null; captchaToken?: string | null } = {},
): Promise<DocUploadResult> {
  const local = validateDocFile(file);
  if (local) throw new MerchantDocUploadError(local);

  const sb = getSupabase();
  if (!sb) throw new MerchantDocUploadError('unknown');

  const form = new FormData();
  form.append('file', file);
  if (opts.replaceReceipt) form.append('replaceReceipt', opts.replaceReceipt);
  if (opts.captchaToken) form.append('captchaToken', opts.captchaToken);

  let data: unknown;
  let error: unknown = null;
  try {
    const res = await sb.functions.invoke('merchant-doc-upload', { body: form });
    data = res.data;
    error = res.error;
  } catch {
    throw new MerchantDocUploadError('network');
  }

  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError; map by status.
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new MerchantDocUploadError('rate_limited');
    if (status === 413) throw new MerchantDocUploadError('file_too_large');
    if (status === 415) throw new MerchantDocUploadError('unsupported_type');
    throw new MerchantDocUploadError('unknown');
  }

  const body = data as Partial<DocUploadResult> | null;
  if (!body || typeof body.receipt !== 'string') {
    throw new MerchantDocUploadError('unknown');
  }
  return { receipt: body.receipt, fileName: body.fileName ?? file.name, size: body.size ?? file.size };
}

// ---- Admin / merchant read side --------------------------------------

/** Documents attached to an application (admin review + merchant status).
 *  RLS scopes this to the owning applicant/merchant or admins. */
export async function listApplicationDocuments(
  applicationId: string,
): Promise<MerchantDocumentRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('merchant_documents')
    .select('*')
    .eq('application_id', applicationId)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MerchantDocumentRow[];
}

/** Mint a SHORT-LIVED signed URL for one document object. The caller
 *  must be authorized by RLS (owning merchant or admin); never a public
 *  URL. Returns null if unauthorized/expired. */
export async function getMerchantDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 120,
): Promise<string | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
