import { requireSupabase } from '../client';
import type {
  DamageCaseInsert,
  DamageCaseRow,
  DamageEvidenceInsert,
  DamageEvidenceRow,
  DamageStatus,
  EvidenceType,
} from '../types';

export type CreateDamageCaseInput = Omit<
  DamageCaseInsert,
  'case_number' | 'raised_at' | 'created_at' | 'updated_at'
>;

export async function createDamageCase(
  input: CreateDamageCaseInput,
): Promise<DamageCaseRow> {
  const sb = requireSupabase();

  const numberRes = await sb.rpc('next_case_number');
  if (numberRes.error) throw numberRes.error;
  const caseNumber = numberRes.data as string;

  const { data, error } = await sb
    .from('damage_cases')
    .insert({
      ...input,
      case_number: caseNumber,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDamageCase(id: string): Promise<DamageCaseRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('damage_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMerchantDamageCases(
  merchantId: string,
  filter?: { status?: DamageStatus; limit?: number },
): Promise<DamageCaseRow[]> {
  const sb = requireSupabase();
  let q = sb.from('damage_cases').select('*').eq('merchant_id', merchantId);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('raised_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listCaseEvidence(
  caseId: string,
): Promise<DamageEvidenceRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('damage_evidence')
    .select('*')
    .eq('case_id', caseId)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------
// Storage hooks — wired but not yet mounted in the UI. The bucket
// `damage-evidence` should be created in the Supabase dashboard with
// merchant-write / admin-read policies (Phase 5 will add the UI).
// ---------------------------------------------------------------------

export const DAMAGE_EVIDENCE_BUCKET = 'damage-evidence';

export type UploadEvidenceInput = {
  caseId: string;
  file: File;
  evidenceType?: EvidenceType;
  caption?: string;
  uploadedByUserId?: string;
};

export async function uploadDamageEvidence(
  input: UploadEvidenceInput,
): Promise<DamageEvidenceRow> {
  const sb = requireSupabase();
  const ext = input.file.name.split('.').pop() ?? 'bin';
  const path = `${input.caseId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await sb.storage
    .from(DAMAGE_EVIDENCE_BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const evidence: DamageEvidenceInsert = {
    case_id: input.caseId,
    evidence_type: input.evidenceType ?? 'photo',
    storage_path: path,
    caption: input.caption ?? null,
    uploaded_by_user_id: input.uploadedByUserId ?? null,
  };

  const { data, error } = await sb
    .from('damage_evidence')
    .insert(evidence)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
