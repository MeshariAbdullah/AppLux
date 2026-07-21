import { useMemo } from 'react';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import {
  fetchMerchantsByIds,
  listCustomerContracts,
  listCustomerInvoices,
  listCustomerNotes,
  listInvoiceItemsByInvoiceIds,
} from '@/lib/supabase';
import type {
  MerchantRow,
  PromissoryNoteRow,
  RentalContractRow,
  RentalInvoiceItemRow,
  RentalInvoiceRow,
} from '@/lib/supabase';

// =====================================================================
// useCustomerRentalData — Phase 4B. The customer dashboard (Home) and
// "My rentals" (Contracts) load the exact same working set: the
// customer's invoices + contracts + notes, then one merchant batch for
// display names. This hook is that shared load, read through the
// Phase 3A memory cache:
//
//   * 2-minute TTL + refetch-on-focus for the three lists
//     (CACHE_TTL.customerLists) — Home → Contracts → Home inside the
//     TTL renders instantly with zero network.
//   * merchant name batch under the 15-minute entity TTL — public
//     display data (name/city), no PII.
//
// Sensitivity ruling (approved 4B scope): these rows are the
// customer's OWN lists, already RLS-scoped; merchant rows are public
// display entities. Profile, eligibility, token-based invoice
// lookups, Review/Approval, activation, and tracking reads stay LIVE
// — none of them route through this hook.
//
// Error semantics preserved from the pages' original fetch chains:
// a failed list resolves to [] (the page renders its normal empty
// sections) — never a thrown error, never demo fallback in live mode.
// Row shape: `null` = still loading (skeleton), `[]` = loaded empty.
// =====================================================================

export type CustomerRentalData = {
  invoiceRows: RentalInvoiceRow[] | null;
  contractRows: RentalContractRow[] | null;
  noteRows: PromissoryNoteRow[] | null;
  merchants: MerchantRow[] | null;
  /** Invoice-item rows grouped by invoice_id — the REAL item names /
   *  line values behind every invoice and contract in the lists
   *  (data-consistency audit: Home and the rentals list previously
   *  had no item data, so titles degraded to fabricated labels).
   *  Missing entry = items still loading or unavailable; consumers
   *  fall back to the real reference number, never an invented name. */
  invoiceItemsByInvoiceId: Record<string, RentalInvoiceItemRow[]> | null;
  /** True until all three lists AND the merchant batch have settled. */
  loading: boolean;
};

export function useCustomerRentalData(
  configured: boolean,
  userId: string | null | undefined,
): CustomerRentalData {
  const uid = configured ? (userId ?? null) : null;

  const inv = useCachedQuery(
    uid ? cacheKeys.customerInvoices(uid) : null,
    () => listCustomerInvoices(uid!),
    { ttlMs: CACHE_TTL.customerLists, refetchOnFocus: true },
  );
  const con = useCachedQuery(
    uid ? cacheKeys.customerContracts(uid) : null,
    () => listCustomerContracts(uid!),
    { ttlMs: CACHE_TTL.customerLists, refetchOnFocus: true },
  );
  const note = useCachedQuery(
    uid ? cacheKeys.customerNotes(uid) : null,
    () => listCustomerNotes(uid!),
    { ttlMs: CACHE_TTL.customerLists, refetchOnFocus: true },
  );

  const settle = <T,>(q: { data: T[] | undefined; loading: boolean; error: Error | null }):
    T[] | null => {
    if (!uid) return null;
    if (q.data !== undefined) return q.data;
    return q.loading ? null : []; // settled with nothing = error → []
  };
  const invoiceRows = settle(inv);
  const contractRows = settle(con);
  const noteRows = settle(note);

  // Merchant display-name batch — key derived from the union of ids in
  // the three lists (sorted, so the key is stable across pages).
  const merchantIds = useMemo(() => {
    if (!invoiceRows || !contractRows || !noteRows) return null;
    return Array.from(
      new Set([
        ...invoiceRows.map((r) => r.merchant_id),
        ...contractRows.map((r) => r.merchant_id),
        ...noteRows.map((r) => r.merchant_id),
      ]),
    ).sort();
  }, [invoiceRows, contractRows, noteRows]);

  const batch = useCachedQuery(
    uid && merchantIds && merchantIds.length > 0
      ? cacheKeys.merchantBatch(merchantIds)
      : null,
    () => fetchMerchantsByIds(merchantIds!),
    { ttlMs: CACHE_TTL.merchantEntity },
  );

  // Batched invoice-item rows for every invoice referenced by the
  // lists (the invoices themselves + the contracts' source invoices).
  // One IN() query, cached with the same lifecycle as the lists and
  // invalidated at the same mutation sites (accept / activation).
  const invoiceIds = useMemo(() => {
    if (!invoiceRows || !contractRows) return null;
    return Array.from(
      new Set([
        ...invoiceRows.map((r) => r.id),
        ...contractRows.map((r) => r.invoice_id),
      ]),
    ).sort();
  }, [invoiceRows, contractRows]);

  const itemsQ = useCachedQuery(
    uid && invoiceIds && invoiceIds.length > 0
      ? cacheKeys.customerInvoiceItems(uid)
      : null,
    () => listInvoiceItemsByInvoiceIds(invoiceIds!),
    { ttlMs: CACHE_TTL.customerLists, refetchOnFocus: true },
  );
  const invoiceItemsByInvoiceId = useMemo(() => {
    if (!uid || invoiceIds === null) return null;
    if (invoiceIds.length === 0) return {};
    if (itemsQ.data === undefined) return itemsQ.loading ? null : {};
    const map: Record<string, RentalInvoiceItemRow[]> = {};
    for (const row of itemsQ.data) {
      (map[row.invoice_id] ??= []).push(row);
    }
    return map;
  }, [uid, invoiceIds, itemsQ.data, itemsQ.loading]);

  const merchants: MerchantRow[] | null = !uid
    ? null
    : merchantIds === null
      ? null // lists still loading
      : merchantIds.length === 0
        ? []
        : batch.data !== undefined
          ? batch.data
          : batch.loading
            ? null
            : []; // batch error → names degrade to '—', page still renders

  const loading =
    uid !== null &&
    (invoiceRows === null ||
      contractRows === null ||
      noteRows === null ||
      merchants === null ||
      invoiceItemsByInvoiceId === null);

  return {
    invoiceRows,
    contractRows,
    noteRows,
    merchants,
    invoiceItemsByInvoiceId,
    loading,
  };
}

/** Same display-name resolution the pages used inline. */
export function buildMerchantNameMap(
  merchants: MerchantRow[] | null,
  locale: 'ar' | 'en',
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of merchants ?? []) {
    map[m.id] =
      (locale === 'ar' ? m.display_name?.ar : m.display_name?.en) ||
      m.display_name?.ar ||
      m.display_name?.en ||
      m.company_name;
  }
  return map;
}
