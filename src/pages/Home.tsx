import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { Avatar, CardSkeleton, PageSkeleton, StatusChip } from '@/components/ui';
import {
  ArrowIcon,
  BadgeCheckIcon,
  BellIcon,
  BuildingIcon,
  CheckIcon,
  ChevronIcon,
  DocIcon,
  ReceiptIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  buildMerchantNameMap,
  useCustomerRentalData,
} from '@/lib/useCustomerRentalData';
import {
  adaptContract,
  adaptContractToHistory,
  adaptEligibility,
  adaptInvoice,
  adaptNote,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, HistoryItem, Invoice, PromissoryNote } from '@/lib/data';
import { cn } from '@/lib/cn';

// =====================================================================
// Customer home — design C05 (approved Conflict-3 HYBRID).
// =====================================================================
// Composition per the imported design: light greeting row (avatar +
// quiet notification bell), the green "verified & ready" banner, then
// the mode-driven hero (pending-offer card / active-rental card with
// the four-stage journey dots / starter / idle), the store-category
// grid, and the recent-rentals strip as the activity block.
//
// PRESERVED per the approved hybrid decision:
//   * the compact eligibility card (live values; taps to /eligibility)
//     — restyled into the design card language, placed right after the
//     verified banner
//   * the notification bell (only route to /notifications)
// Data, caching (4B keys/TTLs/invalidation), the mode precedence and
// every destination are unchanged.
//
// Mode precedence (highest first):
//   attention — any invoice waiting on the customer to accept
//   active    — any signed contract or note still in-flight
//   new       — never used eligibility AND no historic rentals
//   idle      — fall-through (history customers, paused customers)
// =====================================================================

type DashboardMode = 'attention' | 'active' | 'new' | 'idle';

type AttentionInvoice = Invoice & { merchantName: string };
type ActiveRental = {
  contract: Contract;
  invoice?: Invoice;
  note?: PromissoryNote;
  merchantName: string;
};

const CATEGORY_KEYS = ['dresses', 'bags', 'watches', 'bishts'] as const;

export default function Home() {
  const t = useT();
  const { dir, locale, formatCurrency, formatDate } = useI18n();
  const {
    session,
    eligibility: demoEligibility,
    contracts: demoContracts,
    notes: demoNotes,
    invoices: demoInvoices,
    history: demoHistory,
  } = useStore();
  const {
    configured,
    eligibility: dbEligibility,
    profile,
    session: realSession,
  } = useSupabaseAuth();
  const navigate = useNavigate();

  // Eligibility — same source rules as before. New customers in
  // configured mode without a row see an empty (0/0) state.
  const emptyEligibility = {
    limit: 0,
    used: 0,
    remaining: 0,
    tier: 'standard' as const,
    assignedBy: '',
    assignedAt: new Date(0).toISOString(),
  };
  const eligibility = configured
    ? dbEligibility
      ? adaptEligibility(dbEligibility)
      : emptyEligibility
    : demoEligibility;

  const fullName = profile?.full_name ?? session?.fullName ?? '';
  const firstName = fullName.split(' ')[0] ?? '';

  // ---------------------------------------------------------------------
  // Live data
  // ---------------------------------------------------------------------

  // Phase 4B: the three customer lists + the merchant-name batch read
  // through the memory cache (2-min TTL, refetch on focus). Revisiting
  // Home within the TTL renders instantly with zero network; accept /
  // activation invalidate the keys so lifecycle changes show at once.
  // Demo mode: the hook is inert (null rows) and the demo store below
  // remains the only data path, exactly as before.
  const {
    invoiceRows,
    contractRows,
    noteRows,
    merchants,
    loading: liveLoading,
  } = useCustomerRentalData(configured, realSession?.user?.id);

  const nameMap = useMemo(
    () => buildMerchantNameMap(merchants, locale),
    [merchants, locale],
  );

  const liveInvoices = useMemo<Invoice[] | null>(
    () =>
      invoiceRows
        ? invoiceRows.map((r) => adaptInvoice(r, [], nameMap[r.merchant_id]))
        : null,
    [invoiceRows, nameMap],
  );
  const liveContracts = useMemo<Contract[] | null>(
    () =>
      contractRows
        ? contractRows
            .filter((c) => c.status !== 'ended' && c.status !== 'cancelled')
            .map((r) => adaptContract(r, nameMap[r.merchant_id]))
        : null,
    [contractRows, nameMap],
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
            .map((r) => adaptContractToHistory(r, nameMap[r.merchant_id]))
        : null,
    [contractRows, nameMap],
  );

  const invoices = liveInvoices ?? demoInvoices;
  const contracts = liveContracts ?? demoContracts;
  const notes = liveNotes ?? demoNotes;
  const history = liveHistory ?? demoHistory;

  // Index invoices/notes by id so the rental bundle card can fuse them.
  const invoicesByContractRef = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => {
      if (inv.status === 'paid') {
        map.set(inv.id, inv);
      }
    });
    return map;
  }, [invoices]);

  // Build mode-aware projections.
  // Sorted by ascending due date so the most urgent invoice is first.
  const attentionInvoices = useMemo<AttentionInvoice[]>(() => {
    return invoices
      .filter((inv) => inv.status === 'due')
      .map((inv) => ({
        ...inv,
        merchantName: inv.counterparty ?? '',
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [invoices]);

  const activeRentals = useMemo<ActiveRental[]>(() => {
    return contracts
      .filter((c) => c.status === 'active' || c.status === 'pending')
      .map<ActiveRental>((contract) => {
        const note = notes.find((n) => n.counterparty === contract.counterparty);
        const invoice = Array.from(invoicesByContractRef.values()).find(
          (inv) => inv.amount === contract.monthlyAmount,
        );
        return {
          contract,
          note,
          invoice,
          merchantName: contract.counterparty,
        };
      });
  }, [contracts, notes, invoicesByContractRef]);

  const mode: DashboardMode = useMemo(() => {
    if (attentionInvoices.length > 0) return 'attention';
    if (activeRentals.length > 0) return 'active';
    const neverUsed = eligibility.used === 0 && history.length === 0;
    if (neverUsed) return 'new';
    return 'idle';
  }, [attentionInvoices.length, activeRentals.length, eligibility.used, history.length]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  const greetingRow = (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink-500">{t('home.greeting')}</div>
        <h1 className="text-[19px] font-bold text-navy-700 leading-tight truncate">
          {firstName || fullName || '—'}
        </h1>
      </div>
      {/* Quiet notification bell — preserved per the approved hybrid:
          this is the app's only route to /notifications. */}
      <button
        type="button"
        aria-label={t('nav.notifications')}
        onClick={() => navigate('/notifications')}
        className="h-10 w-10 grid place-items-center rounded-xl bg-white ring-[1.5px] ring-beige-300 text-navy-700 hover:ring-navy-200 transition-colors"
      >
        <BellIcon size={16} />
      </button>
      <Avatar name={fullName || 'A'} tone="ink" />
    </div>
  );

  // Loading first — in live mode we MUST NOT render mode-based content
  // until invoices/contracts/notes have been fetched, otherwise the
  // dashboard briefly shows the "new customer" mode before the real
  // data arrives.
  if (configured && liveLoading) {
    return (
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24 space-y-4">
          {greetingRow}
          <CardSkeleton />
          <PageSkeleton rows={3} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen padded={false} className="bg-beige-100">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24 space-y-3">
        {/* ====== C05 greeting ====== */}
        {greetingRow}

        {/* ====== Verified & ready banner ====== */}
        <div className="rounded-xl2 bg-green-50 ring-1 ring-green-200 px-4 py-3 flex items-center gap-2.5">
          <span className="h-5 w-5 shrink-0 rounded-full bg-green-700 text-white grid place-items-center">
            <CheckIcon size={11} strokeWidth={2.5} />
          </span>
          <span className="text-[12.5px] font-semibold text-green-700">
            {t('home.verifiedBanner')}
          </span>
        </div>

        {/* ====== Compact eligibility (preserved; design card chrome).
              Live values + the only path to /eligibility. ====== */}
        <EligibilityCompact
          eligibility={eligibility}
          tierLabel={t(`eligibility.tiers.${eligibility.tier}`)}
          onOpen={() => navigate('/eligibility')}
          formatCurrency={formatCurrency}
          t={t}
          dir={dir}
        />

        {/* ====== Mode-driven hero block ====== */}
        {mode === 'attention' && (
          <AttentionStack
            invoices={attentionInvoices}
            t={t}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            onReview={(invoice) => {
              // Route directly into the review wizard. The tracking
              // page (/track/invoice/<id>) is read-only; the customer
              // needs the wizard at /review/<scanToken> to actually
              // see the contract clauses and approve. Fall back to
              // tracking only if a scan token isn't available.
              if (invoice.scanToken) {
                navigate(`/review/${invoice.scanToken}`);
              } else {
                navigate(`/track/invoice/${invoice.id}`);
              }
            }}
          />
        )}

        {mode === 'active' && (
          <ActiveStack
            rentals={activeRentals}
            t={t}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            onOpenContract={(id) => navigate(`/track/contract/${id}`)}
          />
        )}

        {mode === 'new' && <JourneyStarter t={t} dir={dir} />}

        {mode === 'idle' && <IdleAcknowledgment t={t} dir={dir} />}

        {/* ====== C05 store-category grid → /stores ====== */}
        <div className="flex items-center justify-between pt-1.5">
          <div className="text-[14px] font-bold text-navy-700">
            {t('home.browseStores')}
          </div>
          <Link
            to="/stores"
            className="text-[12.5px] font-bold text-green-700 hover:text-green-800"
          >
            {t('home.browseAll')}
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {CATEGORY_KEYS.map((c) => {
            const label = t(`stores.filters.${c}`);
            return (
              <Link
                key={c}
                to={`/stores?filter=${c}`}
                className="flex flex-col items-center gap-1.5 rounded-[14px] bg-white ring-1 ring-beige-200 px-2 py-3.5 transition-transform active:scale-[0.97]"
              >
                <span className="h-9 w-9 rounded-full bg-beige-100 text-navy-700 grid place-items-center text-[14px] font-bold">
                  {label.charAt(0)}
                </span>
                <span className="text-[11.5px] font-semibold text-ink-800 truncate max-w-full">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* ====== Activity — recent completed rentals (real data) ====== */}
        {history.length > 0 && (
          <HistoryStrip
            items={history.slice(0, 2)}
            t={t}
            dir={dir}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        )}
      </div>
    </Screen>
  );
}

// =====================================================================
// Blocks
// =====================================================================

// Compact eligibility — preserved element, restyled into the C05 card
// language (white 14px-radius card, green accents). Live values; taps
// through to /eligibility.
function EligibilityCompact({
  eligibility,
  tierLabel,
  onOpen,
  formatCurrency,
  t,
  dir,
}: {
  eligibility: {
    limit: number;
    used: number;
    remaining: number;
    tier: string;
  };
  tierLabel: string;
  onOpen: () => void;
  formatCurrency: (n: number) => string;
  t: (k: string, p?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
}) {
  const usagePct =
    eligibility.limit > 0
      ? Math.min(100, Math.round((eligibility.used / eligibility.limit) * 100))
      : 0;
  const hasUsage = eligibility.used > 0 && eligibility.limit > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full text-start rounded-[14px] bg-white ring-1 ring-beige-200 overflow-hidden px-[18px] py-3.5 transition-colors hover:bg-beige-50 active:bg-beige-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-ink-500">
            {t('home.eligibilityCompact.available')}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="num text-[17px] font-bold text-navy-700 tracking-tight">
              {formatCurrency(eligibility.remaining)}
            </span>
            {eligibility.limit > 0 && (
              <span className="text-[10.5px] text-ink-400 num">
                / {formatCurrency(eligibility.limit)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center text-[10.5px] font-bold text-green-700 bg-green-50 rounded-full px-2.5 py-1">
            {tierLabel}
          </span>
          <ChevronIcon
            size={12}
            className={cn('text-ink-300', dir === 'rtl' ? 'rotate-180' : '')}
          />
        </div>
      </div>
      {hasUsage && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] bg-navy-100/60"
        >
          <span
            className="block h-full bg-green-500"
            style={{ width: `${usagePct}%` }}
          />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------

// Pending-offer card — C05: bold title + review chip, meta line with
// the item / amount / date, then the navy full-width review CTA.
function AttentionStack({
  invoices,
  t,
  formatCurrency,
  formatDate,
  onReview,
}: {
  invoices: AttentionInvoice[];
  t: (k: string, p?: Record<string, string | number>) => string;
  formatCurrency: (n: number) => string;
  formatDate: (iso: string) => string;
  onReview: (invoice: AttentionInvoice) => void;
}) {
  // Show only the most urgent pending invoice. The home page is an
  // action hub, not a feed — if there are more, link to the full list.
  const top = invoices[0];
  if (!top) return null;
  const extra = invoices.length - 1;
  const daysLeft = daysUntil(top.dueDate);
  return (
    <div className="space-y-2">
      <div
        key={top.id}
        className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 space-y-3 animate-fade-in"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-bold text-ink-900 truncate">
            {t('home.attention.offerTitle')}
          </span>
          <StatusChip
            size="sm"
            tone="warn"
            dot={false}
            label={t('journey.stages.review')}
          />
        </div>
        <div className="text-[12.5px] text-ink-500 truncate">
          {top.title}
          {top.merchantName ? ` — ${top.merchantName}` : ''}
          {' · '}
          <span className="num">{formatCurrency(top.amount)}</span>
          {' · '}
          <span className="num">
            {daysLeft > 0
              ? t('home.attention.expiresIn', { days: daysLeft })
              : formatDate(top.dueDate)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onReview(top)}
          className="flex items-center justify-center h-12 w-full rounded-xl2 bg-navy-700 text-white font-bold text-[14px] tracking-tight hover:bg-navy-800 active:bg-navy-800 transition-colors"
        >
          {t('home.attention.cta')}
        </button>
      </div>

      {extra > 0 && (
        <Link
          to="/contracts"
          className="block text-center text-[12px] font-bold text-green-700 hover:text-green-800"
        >
          {t('home.attention.morePending', { count: extra })}
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

// Active-rental card — C05: bold title + started chip, meta line, the
// four-stage journey dots with the stage line, then the details CTA.
function ActiveStack({
  rentals,
  t,
  formatCurrency,
  formatDate,
  onOpenContract,
}: {
  rentals: ActiveRental[];
  t: (k: string, p?: Record<string, string | number>) => string;
  formatCurrency: (n: number) => string;
  formatDate: (iso: string) => string;
  onOpenContract: (id: string) => void;
}) {
  const STAGE_KEYS = [
    'journey.stages.request',
    'journey.stages.review',
    'journey.stages.started',
    'journey.stages.closure',
  ];
  return (
    <div className="space-y-3">
      {rentals.map(({ contract, merchantName }) => {
        // Approved four-stage mapping: an ACTIVE contract is in stage 3
        // (بدء الإيجار); a pending one is still in customer review.
        const currentIdx = contract.status === 'active' ? 2 : 1;
        return (
          <div
            key={contract.id}
            className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-bold text-ink-900 truncate">
                {t('home.current.title')}
              </span>
              <StatusChip
                size="sm"
                tone={contract.status === 'active' ? 'success' : 'warn'}
                dot={false}
                label={t(STAGE_KEYS[currentIdx])}
              />
            </div>
            <div className="text-[12.5px] text-ink-500 truncate">
              {contract.title}
              {merchantName && merchantName !== '—' ? ` — ${merchantName}` : ''}
              {' · '}
              <span className="num">{formatCurrency(contract.monthlyAmount)}</span>
              {' · '}
              {t('home.current.endsOnShort', {
                date: formatDate(contract.endDate),
              })}
            </div>

            {/* Four-stage journey dots (same visual language as the
                approved M11/M13 strips). */}
            <div className="flex items-center pt-0.5" aria-hidden>
              {STAGE_KEYS.map((k, i) => (
                <span key={k} className="contents">
                  <span
                    className={cn(
                      'shrink-0 rounded-full',
                      i < currentIdx
                        ? 'h-3 w-3 bg-green-700'
                        : i === currentIdx
                          ? 'h-4 w-4 bg-white border-[3px] border-green-500'
                          : 'h-3 w-3 bg-navy-100/60',
                    )}
                  />
                  {i < STAGE_KEYS.length - 1 && (
                    <span
                      className={cn(
                        'flex-1 h-[2.5px]',
                        i < currentIdx ? 'bg-green-700' : 'bg-navy-100/60',
                      )}
                    />
                  )}
                </span>
              ))}
            </div>
            <div className="text-[11.5px] font-semibold text-green-700">
              {t('home.stageLine', {
                current: currentIdx + 1,
                total: STAGE_KEYS.length,
                stage: t(STAGE_KEYS[currentIdx]),
              })}
            </div>

            <button
              type="button"
              onClick={() => onOpenContract(contract.id)}
              className="flex items-center justify-center h-12 w-full rounded-xl2 bg-navy-700 text-white font-bold text-[14px] tracking-tight hover:bg-navy-800 active:bg-navy-800 transition-colors"
            >
              {t('home.current.cta')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------

function JourneyStarter({
  t,
  dir,
}: {
  t: (k: string) => string;
  dir: 'rtl' | 'ltr';
}) {
  const steps = [
    {
      icon: <BuildingIcon size={15} />,
      title: t('home.starter.step1Title'),
      hint: t('home.starter.step1Hint'),
    },
    {
      icon: <ReceiptIcon size={15} />,
      title: t('home.starter.step2Title'),
      hint: t('home.starter.step2Hint'),
    },
    {
      icon: <DocIcon size={15} />,
      title: t('home.starter.step3Title'),
      hint: t('home.starter.step3Hint'),
    },
  ];
  return (
    <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 animate-fade-in">
      <div className="text-[14px] font-bold text-navy-700">
        {t('home.starter.title')}
      </div>

      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="h-8 w-8 shrink-0 rounded-xl bg-green-50 text-green-700 grid place-items-center">
              {s.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-[13px] font-bold text-ink-900 tracking-tight">
                {s.title}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-500 leading-relaxed">
                {s.hint}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <Link
        to="/stores"
        className="mt-4 flex items-center justify-center gap-1.5 h-12 w-full rounded-xl2 bg-navy-700 text-white font-bold text-[14px] tracking-tight hover:bg-navy-800 active:bg-navy-800 transition-colors"
      >
        {t('home.starter.ctaPrimary')}
        <ArrowIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------

function IdleAcknowledgment({
  t,
  dir,
}: {
  t: (k: string) => string;
  dir: 'rtl' | 'ltr';
}) {
  return (
    <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-green-50 text-green-700 grid place-items-center">
          <BadgeCheckIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink-900 tracking-tight">
            {t('home.idle.title')}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
            {t('home.idle.subtitle')}
          </div>
        </div>
      </div>
      <Link
        to="/stores"
        className="mt-3.5 flex items-center justify-center gap-1.5 h-11 w-full rounded-xl2 bg-white text-navy-700 ring-[1.5px] ring-inset ring-beige-300 font-bold text-[13.5px] tracking-tight hover:bg-beige-50 transition-colors"
      >
        {t('home.idle.cta')}
        <ArrowIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------

function HistoryStrip({
  items,
  t,
  dir,
  formatCurrency,
  formatDate,
}: {
  items: HistoryItem[];
  t: (k: string) => string;
  dir: 'rtl' | 'ltr';
  formatCurrency: (n: number) => string;
  formatDate: (iso: string) => string;
}) {
  return (
    <section className="pt-1.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[14px] font-bold text-navy-700">
          {t('home.historyStrip.title')}
        </div>
        <Link
          to="/contracts"
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700 hover:text-green-800"
        >
          {t('home.historyStrip.viewAll')}
          <ArrowIcon size={12} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
        </Link>
      </div>
      <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px]">
        {items.map((h, i) => (
          <div key={h.id}>
            <div className="flex items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-ink-900 truncate tracking-tight">
                  {h.title}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-500 truncate">
                  {h.counterparty !== '—' ? h.counterparty + ' · ' : ''}
                  <span className="num">{formatDate(h.closedAt)}</span>
                </div>
              </div>
              <div className="text-end shrink-0">
                <div className="text-[13px] font-bold text-ink-900 num">
                  {formatCurrency(h.amount)}
                </div>
                <div className="text-[10.5px] text-green-700 font-bold mt-0.5">
                  {t('status.history.completed')}
                </div>
              </div>
            </div>
            {i < items.length - 1 && <div className="h-px bg-beige-100" />}
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// Small utilities
// =====================================================================

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
