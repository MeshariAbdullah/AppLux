import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Card, PageSkeleton, SectionHeader } from '@/components/ui';
import {
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  ReceiptIcon,
} from '@/components/icons';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { useI18n, useT } from '@/lib/i18n';
import { formatValidUntil } from '@/lib/offerExpiry';
import { useStore } from '@/lib/store';
import {
  buildMerchantNameMap,
  useCustomerRentalData,
} from '@/lib/useCustomerRentalData';
import {
  adaptContract,
  adaptContractToHistory,
  adaptInvoice,
  adaptNote,
  getHandoverPhotoUrl,
  getReceiptPhotoUrl,
  listContractReceiptPhotos,
  useSupabaseAuth,
} from '@/lib/supabase';
import type {
  Contract,
  HistoryItem,
  Invoice,
  PromissoryNote,
} from '@/lib/data';
import { cn } from '@/lib/cn';

// =====================================================================
// My rentals — three sections, one destination for the whole lifecycle.
//
//   1. Pending invoices   — issued / viewed invoices waiting on the
//                           customer's approval. Tappable rows that
//                           route to /track/invoice/<id>.
//   2. Active rentals     — compound bundle cards (contract + note +
//                           handover)
//   3. Past rentals       — settled rentals
//
// The page is the canonical "View all" destination from the home
// dashboard's "+N more invoices waiting" link. Invoices must NOT
// disappear here just because a contract hasn't been created yet —
// they're part of the same rental lifecycle.
// =====================================================================

export default function Contracts() {
  const t = useT();
  const { locale } = useI18n();
  const {
    invoices: demoInvoices,
    contracts: demoContracts,
    notes: demoNotes,
    history: demoHistory,
  } = useStore();
  const { configured, session } = useSupabaseAuth();

  // Phase 4B: same cached working set as Home (2-min lists + 15-min
  // merchant-name batch). Home → Contracts within the TTL is instant
  // with zero network; the in-flight dedupe means a cold boot landing
  // on either page fires each list request exactly once app-wide.
  const {
    invoiceRows,
    contractRows,
    noteRows,
    merchants,
    invoiceItemsByInvoiceId,
    loading: liveLoading,
  } = useCustomerRentalData(configured, session?.user?.id);

  const nameMap = useMemo(
    () => buildMerchantNameMap(merchants, locale),
    [merchants, locale],
  );

  const livePending = useMemo<Invoice[] | null>(
    () =>
      invoiceRows
        ? invoiceRows
            .filter((r) => r.status === 'issued' || r.status === 'viewed')
            .map((r) => adaptInvoice(r, invoiceItemsByInvoiceId?.[r.id] ?? [], nameMap[r.merchant_id]))
        : null,
    [invoiceRows, nameMap, invoiceItemsByInvoiceId],
  );
  const liveContracts = useMemo<Contract[] | null>(
    () =>
      contractRows
        ? contractRows
            .filter((c) => c.status !== 'ended' && c.status !== 'cancelled')
            .map((r) => adaptContract(r, nameMap[r.merchant_id], invoiceItemsByInvoiceId?.[r.invoice_id]?.[0]?.item_name))
        : null,
    [contractRows, nameMap, invoiceItemsByInvoiceId],
  );
  const liveNotes = useMemo<PromissoryNote[] | null>(
    () =>
      noteRows ? noteRows.map((r) => adaptNote(r, nameMap[r.merchant_id])) : null,
    [noteRows, nameMap],
  );
  const liveHistory = useMemo<HistoryItem[] | null>(
    () =>
      contractRows
        ? contractRows
            .filter((c) => c.status === 'ended' || c.status === 'cancelled')
            .map((r) => adaptContractToHistory(r, nameMap[r.merchant_id], invoiceItemsByInvoiceId?.[r.invoice_id]?.[0]?.item_name))
        : null,
    [contractRows, nameMap, invoiceItemsByInvoiceId],
  );

  // Demo fallback: the demo store keeps invoices with the UI 'due'
  // status which mirrors live 'issued'. Treat them as pending here.
  const pending = livePending ?? demoInvoices.filter((i) => i.status === 'due');
  const contracts = liveContracts ?? demoContracts;
  const notes = liveNotes ?? demoNotes;
  const history = liveHistory ?? demoHistory;

  const rentals = useMemo(
    () =>
      contracts.map((contract) => ({
        contract,
        note: notes.find((n) => n.counterparty === contract.counterparty),
      })),
    [contracts, notes],
  );

  const hasNothing =
    pending.length === 0 && rentals.length === 0 && history.length === 0;

  // Loading first — never let the "no rentals yet" empty state flash
  // while the live customer query is still resolving (Phase 9).
  if (configured && liveLoading) {
    return (
      <>
        <Header title={t('contracts.title')} />
        <Screen className="bg-canvas">
          <PageSkeleton rows={4} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Header title={t('contracts.title')} />
      <Screen className="bg-canvas">
        {hasNothing ? (
          <EmptyRentals />
        ) : (
          <>
            {pending.length > 0 && (
              <section>
                <SectionHeader title={t('contracts.sections.pending')} />
                <Card padded={false} className="px-5">
                  {pending.map((inv, i) => (
                    <div key={inv.id}>
                      <PendingInvoiceRow invoice={inv} />
                      {i < pending.length - 1 && (
                        <div className="h-px bg-canvas-200/80" />
                      )}
                    </div>
                  ))}
                </Card>
              </section>
            )}

            {rentals.length > 0 && (
              <section>
                <SectionHeader title={t('contracts.sections.newContracts')} />
                <div className="space-y-3">
                  {rentals.map((r) => (
                    <RentalBundleCard
                      key={r.contract.id}
                      contract={r.contract}
                      note={r.note}
                    />
                  ))}
                </div>
              </section>
            )}

            {history.length > 0 && (
              <section>
                <SectionHeader title={t('contracts.sections.past')} />
                <Card padded={false} className="px-5">
                  {history.map((h, i) => (
                    <div key={h.id}>
                      <PastRentalRow item={h} />
                      {i < history.length - 1 && (
                        <div className="h-px bg-canvas-200/80" />
                      )}
                    </div>
                  ))}
                </Card>
              </section>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

// =====================================================================
// Pending invoice row — opens the focused invoice tracking page.
// Surfaces the merchant name + item title at the top, then the amount
// and due date underneath, with a clear "Review" affordance.
// =====================================================================

function PendingInvoiceRow({ invoice }: { invoice: Invoice }) {
  const t = useT();
  const { dir, locale, formatCurrency, formatDate } = useI18n();
  // REAL persisted expiry only (20260502123800) — the old
  // daysUntil(dueDate) fallback painted fake "انتهت" copy off the
  // issuance date. Missing expiry → neutral (no hint, no fake state).
  const validUntil = formatValidUntil(invoice.expiresAt, locale);
  return (
    <Link
      to={`/track/invoice/${invoice.id}`}
      className="flex items-center gap-3 py-3.5 -mx-1 px-1 rounded-2xl transition-colors hover:bg-canvas-100/60 active:bg-canvas-100"
    >
      <span className="h-11 w-11 shrink-0 rounded-2xl bg-warn-50 text-warn-700 ring-1 ring-warn-500/20 grid place-items-center">
        <ReceiptIcon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        {invoice.counterparty && (
          <div className="text-[11px] font-semibold text-warn-700 uppercase tracking-[0.1em] truncate">
            {t('home.attention.fromMerchant', { merchant: invoice.counterparty })}
          </div>
        )}
        <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 truncate tracking-tight">
          {invoice.title}
        </div>
        {validUntil && (
          <div className="mt-0.5 text-[11.5px] text-ink-400 truncate num">
            {t('offer.validUntil', { dateTime: validUntil })}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="text-[13.5px] font-semibold text-ink-900 num">
          {formatCurrency(invoice.amount)}
        </div>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-lavender-700">
          {t('contracts.pending.review')}
          <ArrowIcon
            size={11}
            className={cn(dir === 'rtl' ? 'rotate-180' : '')}
          />
        </span>
      </div>
    </Link>
  );
}

// =====================================================================
// Bundle card — one rental, all its artifacts.
// =====================================================================

function RentalBundleCard({
  contract,
  note,
}: {
  contract: Contract;
  note?: PromissoryNote;
}) {
  const t = useT();
  const { dir, formatCurrency, formatDate } = useI18n();
  const daysLeft = daysUntil(contract.endDate);

  return (
    <Card className="animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink-900 tracking-tight truncate">
            {contract.title}
          </div>
          {contract.counterparty && contract.counterparty !== '—' && (
            <div className="mt-0.5 text-[12.5px] text-ink-500 truncate">
              {contract.counterparty}
            </div>
          )}
        </div>
        <div className="text-end shrink-0 num">
          <div className="editorial-title text-[22px] text-ink-900 leading-none">
            {daysLeft > 0 ? daysLeft : '0'}
          </div>
          <div className="mt-1 text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
            {daysLeft > 0
              ? t('home.current.daysLeftArabic', { days: daysLeft })
              : t('home.current.endsToday')}
          </div>
        </div>
      </div>

      {/* Artifact summary — note pill hidden in the current phase
          (ENABLE_PAYMENTS_AND_NOTES). */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ArtifactPill
          icon={<DocIcon size={13} />}
          label={t('home.current.contractPill')}
          state={contract.status === 'active' ? 'signed' : 'pending'}
          t={t}
        />
        {ENABLE_PAYMENTS_AND_NOTES && (
          <ArtifactPill
            icon={<BadgeCheckIcon size={13} />}
            label={t('home.current.notePill')}
            state={note?.status === 'signed' ? 'signed' : 'pending'}
            t={t}
          />
        )}
      </div>

      {/* Period + amount */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field
          label={t('contracts.bundle.amountLabel')}
          value={formatCurrency(contract.monthlyAmount)}
        />
        <Field
          label={t('contracts.bundle.endsOn')}
          value={formatDate(contract.endDate)}
          align="end"
        />
      </div>

      {/* Receipt documentation — READ-ONLY (Bugs 17/19). Photography
          now happens inside the guided acceptance flow before
          activation; this block only shows the documented result. */}
      <ReceiptDocumentedBlock contract={contract} />

      <Link
        to={`/track/contract/${contract.id}`}
        className={cn(
          'mt-2 inline-flex items-center justify-center gap-1.5 h-11 w-full rounded-xl2',
          'bg-white text-ink-900 ring-1 ring-canvas-200 font-semibold text-[13.5px] tracking-tight',
          'hover:bg-canvas-100/60 active:bg-canvas-100 transition-colors',
        )}
      >
        {t('home.current.cta')}
        <ArrowIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
      </Link>
    </Card>
  );
}

function ArtifactPill({
  icon,
  label,
  state,
  t,
}: {
  icon: ReactNode;
  label: string;
  state: 'signed' | 'pending';
  t: (k: string) => string;
}) {
  const signed = state === 'signed';
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 flex items-center gap-2 ring-1',
        signed
          ? 'bg-success-50 ring-success-500/20 text-success-700'
          : 'bg-canvas-100 ring-canvas-200 text-ink-500',
      )}
    >
      <span className="grid place-items-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-ink-700 truncate">
          {label}
        </div>
        <div
          className={cn(
            'text-[10px] font-semibold mt-0.5',
            signed ? 'text-success-600' : 'text-ink-400',
          )}
        >
          {signed
            ? t('home.current.stateSigned')
            : t('home.current.statePending')}
        </div>
      </div>
      {signed && <CheckIcon size={11} className="ms-auto shrink-0" />}
    </div>
  );
}

function Field({
  label,
  value,
  align = 'start',
}: {
  label: string;
  value: string;
  align?: 'start' | 'end';
}) {
  return (
    <div className={cn(align === 'end' && 'text-end')}>
      <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 num">
        {value}
      </div>
    </div>
  );
}

// =====================================================================
// Past rental row — minimal, typographic, premium.
// =====================================================================

function PastRentalRow({ item }: { item: HistoryItem }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate tracking-tight">
          {item.title}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-400 truncate">
          {item.counterparty && item.counterparty !== '—'
            ? `${item.counterparty} · `
            : ''}
          {t('contracts.past.completedOn', { date: formatDate(item.closedAt) })}
        </div>
      </div>
      <div className="text-end shrink-0">
        <div className="text-[13px] font-semibold text-ink-900 num">
          {formatCurrency(item.amount)}
        </div>
        <div className="text-[10.5px] text-success-600 font-semibold mt-0.5">
          {t('contracts.past.settledNote')}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Empty state — single editorial card. No stacked "no X" blocks.
// =====================================================================

function EmptyRentals() {
  const t = useT();
  const { dir } = useI18n();
  return (
    <Card className="animate-fade-in">
      <div className="flex flex-col items-center text-center py-4">
        <span className="h-12 w-12 rounded-2xl bg-lavender-50 text-lavender-700 ring-1 ring-lavender-200 grid place-items-center">
          <DocIcon size={20} />
        </span>
        {/* Test-fix Bug 6: icon + short title + button only — the
            descriptive paragraph was removed. */}
        <div className="mt-3 editorial-title text-[20px] text-ink-900 leading-snug tracking-tight">
          {t('contracts.empty.title')}
        </div>
        <Link
          to="/stores"
          className={cn(
            'mt-5 inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-xl2',
            'bg-ink-900 text-white font-semibold text-[13.5px] tracking-tight',
            'shadow-plush hover:bg-ink-800 active:bg-ink-800 transition-colors',
          )}
        >
          {t('contracts.empty.cta')}
          <ArrowIcon
            size={14}
            className={cn(dir === 'rtl' ? 'rotate-180' : '')}
          />
        </Link>
      </div>
    </Card>
  );
}

// =====================================================================
// Receipt documentation — READ-ONLY result of the guided-flow
// photography step (Bugs 17/19). The customer captures and confirms
// the photos INSIDE the acceptance flow before activation; nothing is
// captured, replaced, or deleted from here anymore. Contracts that
// predate the flow fall back to the legacy single handover photo when
// one exists; otherwise the block renders nothing.
// Previews use short-lived signed URLs — storage paths never render.
// =====================================================================

function ReceiptDocumentedBlock({ contract }: { contract: Contract }) {
  const t = useT();
  const { configured } = useSupabaseAuth();
  const [urls, setUrls] = useState<string[]>([]);

  const confirmed = Boolean(contract.receiptPhotosConfirmedAt);
  const legacyPath = contract.handoverPhotoPath ?? null;

  useEffect(() => {
    if (!configured) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (confirmed) {
        const rows = await listContractReceiptPhotos(contract.id).catch(() => []);
        const signed = await Promise.all(
          rows.map((r) => getReceiptPhotoUrl(r.storage_path)),
        );
        if (!cancelled) setUrls(signed.filter((u): u is string => Boolean(u)));
        return;
      }
      if (legacyPath) {
        const url = await getHandoverPhotoUrl(legacyPath).catch(() => null);
        if (!cancelled) setUrls(url ? [url] : []);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [configured, confirmed, legacyPath, contract.id]);

  if (!confirmed && !legacyPath) return null;

  return (
    <div className="mt-4 rounded-xl2 p-3.5 ring-1 bg-success-50 ring-success-500/20">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center ring-1 bg-white text-success-600 ring-success-500/20">
          <CheckIcon size={16} />
        </span>
        <div className="text-[12.5px] font-semibold text-success-700">
          {t('contracts.receipt.documented')}
        </div>
      </div>

      {urls.length > 0 && (
        <div className={cn('mt-3 grid gap-2', urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {urls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={t('contracts.receipt.photoAlt', { n: i + 1 })}
              className="rounded-xl2 ring-1 ring-canvas-200 max-h-44 object-cover w-full"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
