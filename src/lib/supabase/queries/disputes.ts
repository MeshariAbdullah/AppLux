import { requireSupabase } from '../client';
import { DAMAGE_EVIDENCE_BUCKET, listCaseEvidence } from './damages';
import type {
  DamageCaseRow,
  DamageEvidenceRow,
  DisputeEventRow,
  DisputeProposalResponseRow,
  DisputeProposalRow,
} from '../types';

// =====================================================================
// Phase-1 dispute lifecycle — customer/merchant query + RPC layer over
// the 20260502124700 server foundation. The UI phase MUST come from
// damage_cases.dispute_phase, the terminal result from
// dispute_outcome. Legacy `stage` never drives anything here.
// =====================================================================

/** The case as visible to the CURRENT user — RLS scopes the read to
 *  the contract customer, the merchant owner, or admin. Returns null
 *  for unknown ids AND for cases the caller may not see (same render
 *  path: an explicit not-found/access state). */
export async function fetchDisputeCase(id: string): Promise<DamageCaseRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('damage_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type DisputeProposalWithResponses = DisputeProposalRow & {
  dispute_proposal_responses: DisputeProposalResponseRow[];
};

/** All proposals for a case with their per-party responses, oldest
 *  first. Round numbers and statuses are SERVER truth — the client
 *  never counts rounds itself. */
export async function listDisputeProposals(
  caseId: string,
): Promise<DisputeProposalWithResponses[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('dispute_settlement_proposals')
    .select('*, dispute_proposal_responses(*)')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DisputeProposalWithResponses[];
}

/** Immutable dispute timeline (claim_opened … dispute_resolved). */
export async function listDisputeEvents(
  caseId: string,
): Promise<DisputeEventRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('dispute_events')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type DisputeEvidenceItem = {
  row: DamageEvidenceRow;
  /** Signed preview URL (1h) or null when signing failed — the tile
   *  renders a placeholder rather than a broken image. */
  url: string | null;
};

/** Case evidence rows + signed URLs, upload order. Callers split
 *  merchant vs customer items by `row.uploaded_by_user_id`. */
export async function listDisputeEvidence(
  caseId: string,
  expiresInSeconds = 60 * 60,
): Promise<DisputeEvidenceItem[]> {
  const sb = requireSupabase();
  const rows = await listCaseEvidence(caseId);
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await sb.storage
        .from(DAMAGE_EVIDENCE_BUCKET)
        .createSignedUrl(row.storage_path, expiresInSeconds);
      return { row, url: data?.signedUrl ?? null };
    }),
  );
}

// ---------------------------------------------------------------------
// RPC wrappers — exact deployed names/signatures from 20260502124700.
// All transitions are server-authoritative; these only relay.
// ---------------------------------------------------------------------

export async function customerAcceptClaim(caseId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('customer_accept_claim', { p_case_id: caseId });
  if (error) throw error;
}

export async function customerObjectToClaim(
  caseId: string,
  reason: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('customer_object_to_claim', {
    p_case_id: caseId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function submitSettlementProposal(
  caseId: string,
  amount: number,
  note?: string,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('submit_settlement_proposal', {
    p_case_id: caseId,
    p_amount: amount,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function respondToSettlementProposal(
  proposalId: string,
  accept: boolean,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('respond_to_settlement_proposal', {
    p_proposal_id: proposalId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function respondToLendProposal(
  caseId: string,
  accept: boolean,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('respond_to_lend_proposal', {
    p_case_id: caseId,
    p_accept: accept,
  });
  if (error) throw error;
}
