import { requireSupabase } from '../client';
import type {
  InvoiceStatus,
  RentalInvoiceItemInsert,
  RentalInvoiceItemRow,
  RentalInvoiceRow,
} from '../types';

export type CreateInvoiceInput = {
  merchantId: string;
  branchId?: string | null;
  customerUserId: string;
  /** Rental fee = daily_rate × rental_days. */
  subtotalAmount: number;
  taxAmount?: number;
  /** Legacy column kept for back-compat; defaults to 0. */
  securityDeposit?: number;
  /** Rental fee charge — total customer pays for the rental period. */
  totalAmount: number;
  /** Required. The underlying value of the rented item — drives
   *  eligibility holds and the promissory note principal. */
  originalItemValue: number;
  /** Light damage fraction the merchant confirmed in the contract
   *  preparation step. Defaults to 0.30. */
  lightDamageFraction?: number;
  /** Late return per-day multiplier (× daily rate) the merchant
   *  confirmed. Defaults to 1.5. */
  lateReturnMultiplier?: number;
  notes?: string | null;
  expiresAt?: string | null;
  /** Merchant-set rental start moment (ISO timestamptz). When null
   *  the contract's start_date defaults to the customer's
   *  acceptance day (legacy behaviour). */
  startsAt?: string | null;
  items: Array<Omit<RentalInvoiceItemInsert, 'invoice_id'>>;
};

export type CreatedInvoice = {
  invoice: RentalInvoiceRow;
  items: RentalInvoiceItemRow[];
};

/**
 * Creates a rental_invoice + its items in two sequential calls.
 * Returns the inserted invoice with its scan_token populated, and the items.
 */
export async function createInvoiceWithItems(
  input: CreateInvoiceInput,
): Promise<CreatedInvoice> {
  const sb = requireSupabase();

  // Generate human-readable invoice number + a 24-char scan token.
  const numberRes = await sb.rpc('next_invoice_number');
  if (numberRes.error) throw numberRes.error;
  const invoiceNumber = numberRes.data as string;

  const scanToken = makeScanToken();

  const { data: invoice, error: invoiceError } = await sb
    .from('rental_invoices')
    .insert({
      invoice_number: invoiceNumber,
      merchant_id: input.merchantId,
      branch_id: input.branchId ?? null,
      customer_user_id: input.customerUserId,
      subtotal_amount: input.subtotalAmount,
      tax_amount: input.taxAmount ?? 0,
      security_deposit: input.securityDeposit ?? 0,
      total_amount: input.totalAmount,
      original_item_value: input.originalItemValue,
      light_damage_fraction: input.lightDamageFraction ?? 0.3,
      late_return_multiplier: input.lateReturnMultiplier ?? 1.5,
      status: 'issued' satisfies InvoiceStatus,
      issued_at: new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      starts_at: input.startsAt ?? null,
      scan_token: scanToken,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();
  if (invoiceError) throw invoiceError;

  const itemsPayload: RentalInvoiceItemInsert[] = input.items.map((it, idx) => ({
    ...it,
    invoice_id: invoice.id,
    position: it.position ?? idx,
  }));

  const { data: items, error: itemsError } = await sb
    .from('rental_invoice_items')
    .insert(itemsPayload)
    .select('*');
  if (itemsError) throw itemsError;

  return { invoice, items: items ?? [] };
}

export async function fetchInvoiceById(id: string): Promise<RentalInvoiceRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchInvoiceByContractId(
  contractId: string,
): Promise<RentalInvoiceRow | null> {
  const sb = requireSupabase();
  const { data: contract, error: cErr } = await sb
    .from('rental_contracts')
    .select('invoice_id')
    .eq('id', contractId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!contract?.invoice_id) return null;
  return fetchInvoiceById(contract.invoice_id);
}

export async function fetchInvoiceByToken(
  token: string,
): Promise<{ invoice: RentalInvoiceRow; items: RentalInvoiceItemRow[] } | null> {
  const sb = requireSupabase();
  const { data: invoice, error } = await sb
    .from('rental_invoices')
    .select('*')
    .eq('scan_token', token)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) return null;

  const { data: items, error: itemsError } = await sb
    .from('rental_invoice_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('position', { ascending: true });
  if (itemsError) throw itemsError;

  return { invoice, items: items ?? [] };
}

export async function listInvoiceItems(
  invoiceId: string,
): Promise<RentalInvoiceItemRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** One batched read for the item rows of many invoices — powers the
 *  REAL item names/values on the customer Home and rentals list
 *  (data-consistency audit) without N+1 requests. */
export async function listInvoiceItemsByInvoiceIds(
  invoiceIds: string[],
): Promise<RentalInvoiceItemRow[]> {
  if (invoiceIds.length === 0) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('rental_invoice_items')
    .select('*')
    .in('invoice_id', invoiceIds)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listCustomerInvoices(
  customerUserId: string,
  filter?: { status?: InvoiceStatus; limit?: number },
): Promise<RentalInvoiceRow[]> {
  const sb = requireSupabase();
  let q = sb
    .from('rental_invoices')
    .select('*')
    .eq('customer_user_id', customerUserId);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('issued_at', { ascending: false, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function listMerchantInvoices(
  merchantId: string,
  filter?: { status?: InvoiceStatus; limit?: number },
): Promise<RentalInvoiceRow[]> {
  const sb = requireSupabase();
  let q = sb.from('rental_invoices').select('*').eq('merchant_id', merchantId);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('issued_at', { ascending: false, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Customer-side acceptance — wraps the SECURITY DEFINER RPC. This
 * call ONLY moves the invoice to 'accepted' and creates the contract
 * in 'pending' state. It does NOT create the promissory note and does
 * NOT bump eligibility — those happen later in the lifecycle:
 *   record_rental_payment    → creates the note (pending)
 *   record_nafath_signing    → marks the note as signed
 *   verify_and_activate_rental → flips contract to active, bumps eligibility
 * Returns the new contract id.
 */
export async function acceptRentalInvoice(invoiceId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('accept_rental_invoice', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Customer rejects an issued/viewed offer (20260502123700). Terminal,
 * idempotent, row-locked server-side: P0171 when expired, P0172 for
 * other non-actionable states — translated to business copy by
 * translateError. Releases the eligibility reservation automatically
 * (the reservation model is derived).
 */
export async function rejectRentalInvoice(invoiceId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('reject_rental_invoice', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
}

/**
 * T2 — record the customer's payment for an accepted invoice. Creates
 * the promissory note in 'pending' state (or returns the existing
 * note id if one was already created). Returns the note id.
 */
export async function recordRentalPayment(invoiceId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('record_rental_payment', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * T3 — record the customer's Nafath signing of the promissory note.
 * Marks the note as signed and stamps signed_at. Idempotent.
 */
export async function recordNafathSigning(noteId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('record_nafath_signing', {
    p_note_id: noteId,
  });
  if (error) throw error;
}

/**
 * T4 — final verification + activation. Stamps the note as Nafath-
 * attested, flips the contract to 'active', and bumps the customer's
 * eligibility used_amount once. Idempotent. Returns the contract id.
 */
export async function verifyAndActivateRental(noteId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('verify_and_activate_rental', {
    p_note_id: noteId,
  });
  if (error) throw error;
  return data as string;
}

/**
 * CURRENT-PHASE activation (ENABLE_PAYMENTS_AND_NOTES = false): flips
 * the customer's own pending contract to active and applies the
 * eligibility hold (original item value) exactly once — WITHOUT
 * creating payment records, promissory-note rows, or Nafath/Nafith
 * stamps. Idempotent: re-calling on an already-active contract returns
 * the id without a second hold, so the Review flow's "retry
 * activation" is always safe. Errors P0090–P0093 (see
 * 20260502122400_activate_rental_without_payment_and_note.sql).
 */
export async function activateRentalWithoutPaymentAndNote(
  contractId: string,
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc(
    'activate_rental_without_payment_and_note',
    { p_contract_id: contractId },
  );
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------------

function makeScanToken(): string {
  // 24-char alphanumeric token. Random enough for an MVP; replace with
  // a server-side generator + table uniqueness check in Phase 5+ if needed.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}
