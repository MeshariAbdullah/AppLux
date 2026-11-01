// =====================================================================
// Package 1 — offer cancellation + closure-request lifecycle queries.
// All writes go through SECURITY DEFINER RPCs (20260502130600); the
// client never mutates these tables directly. Reads are RLS-scoped to
// the contract's parties (admins read all).
// =====================================================================
import { requireSupabase } from '../client';

export type ClosureRequestKind = 'non_handover' | 'return_declared';
export type ClosureRequestStatus =
  | 'open'
  | 'confirmed'
  | 'objected'
  | 'admin_review'
  | 'auto_closed'
  | 'voided';

export type ClosureRequestRow = {
  id: string;
  contract_id: string;
  kind: ClosureRequestKind;
  status: ClosureRequestStatus;
  requested_by: string;
  requested_role: 'customer' | 'merchant' | 'admin';
  declared_return_at: string | null;
  request_note: string | null;
  deadline_at: string | null;
  responded_by: string | null;
  responded_at: string | null;
  response_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type ContractEventRow = {
  id: string;
  contract_id: string | null;
  invoice_id: string | null;
  request_id: string | null;
  actor_user_id: string | null;
  event: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
};

/** Merchant cancels their own issued/viewed offer (idempotent). */
export async function merchantCancelRentalOffer(invoiceId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('merchant_cancel_rental_offer', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
}

/**
 * Open a closure request: 'non_handover' on an accepted-pending
 * contract (either party), or 'return_declared' on an active rental
 * (customer only). Idempotent — a live request's id is returned.
 */
export async function requestContractClosure(input: {
  contractId: string;
  kind: ClosureRequestKind;
  declaredReturnAt?: string | null;
  note?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('request_contract_closure', {
    p_contract_id: input.contractId,
    p_kind: input.kind,
    p_declared_return_at: input.declaredReturnAt ?? null,
    p_note: input.note ?? null,
    p_evidence_path: null,
  });
  if (error) throw error;
  return data as string;
}

/** Counterparty (or admin) confirms — closes the contract server-side. */
export async function confirmContractClosure(
  requestId: string,
  note?: string | null,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('confirm_contract_closure', {
    p_request_id: requestId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as string; // the derived closure reason
}

/** Counterparty objects — suspends auto-closure, routes to admin review. */
export async function objectContractClosure(
  requestId: string,
  reason: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('object_contract_closure', {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Admin resolves an exceptional request: 'close' or 'void'. */
export async function adminResolveClosureRequest(
  requestId: string,
  action: 'close' | 'void',
  note?: string | null,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('admin_resolve_closure_request', {
    p_request_id: requestId,
    p_action: action,
    p_note: note ?? null,
  });
  if (error) throw error;
}

/** The contract's live (open / admin-review) request, if any. */
export async function fetchLiveClosureRequest(
  contractId: string,
): Promise<ClosureRequestRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('contract_closure_requests')
    .select('*')
    .eq('contract_id', contractId)
    .in('status', ['open', 'admin_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ClosureRequestRow | null) ?? null;
}

/** Full audit timeline for a contract (RLS: parties + admin). */
export async function listContractEvents(
  contractId: string,
): Promise<ContractEventRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('contract_events')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ContractEventRow[];
}

export type AdminClosureQueueRow = ClosureRequestRow & {
  rental_contracts: {
    contract_number: string;
    status: string;
    customer_user_id: string;
    merchant_id: string;
  } | null;
};

/** Admin: exceptional closure queue (objections + escalations). */
export async function listAdminClosureQueue(): Promise<AdminClosureQueueRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('contract_closure_requests')
    .select('*, rental_contracts(contract_number, status, customer_user_id, merchant_id)')
    .in('status', ['admin_review'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AdminClosureQueueRow[];
}
