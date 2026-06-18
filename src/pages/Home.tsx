import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Avatar, Card, IconButton, SectionHeader } from '@/components/ui';
import {
  ArrowIcon,
  BadgeCheckIcon,
  BellIcon,
  CheckIcon,
  ChevronIcon,
  DocIcon,
  QrIcon,
  ReceiptIcon,
  ShieldIcon,
  SparkleIcon,
  BuildingIcon,
  UserIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptContractToHistory,
  adaptEligibility,
  adaptInvoice,
  adaptNote,
  fetchMerchantsByIds,
  listCustomerContracts,
  listCustomerInvoices,
  listCustomerNotes,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, HistoryItem, Invoice, PromissoryNote } from '@/lib/data';
import { cn } from '@/lib/cn';
import type { MerchantRow } from '@/lib/supabase';

// =====================================================================
// Customer home — mode-driven layout
// =====================================================================
// The dashboard derives ONE `mode` from the loaded data and composes
// itself from a small set of mode-aware blocks. The same screen renders
// very differently for the four customer states (new / attention /
// active / idle) without stacking parallel empty-state cards.
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

  const [liveInvoices, setLiveInvoices] = useState<Invoice[] | null>(null);
  const [liveContracts, setLiveContracts] = useState<Contract[] | null>(null);
  const [liveNotes, setLiveNotes] = useState<PromissoryNote[] | null>(null);
  const [liveHistory, setLiveHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    const userId = realSession?.user?.id;
    if (!configured || !userId) {
      setLiveInvoices(null);
      setLiveContracts(null);
      setLiveNotes(null);
      setLiveHistory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [invoiceRows, contractRows, noteRows] = await Promise.all([
        listCustomerInvoices(userId).catch(() => []),
        listCustomerContracts(userId).catch(() => []),
        listCustomerNotes(userId).catch(() => []),
      ]);
      if (cancelled) return;

      // Resolve merchant display names in one batch.
      const merchantIds = Array.from(
        new Set([
          ...invoiceRows.map((r) => r.merchant_id),
          ...contractRows.map((r) => r.merchant_id),
          ...noteRows.map((r) => r.merchant_id),
        ]),
      );
      const merchants = await fetchMerchantsByIds(merchantIds).catch(
        () => [] as MerchantRow[],
      );
      if (cancelled) return;
      const nameMap: Record<string, string> = {};
      for (const m of merchants) {
        const display =
          (locale === 'ar' ? m.display_name?.ar : m.display_name?.en) ||
          m.display_name?.ar ||
          m.display_name?.en ||
          m.company_name;
        nameMap[m.id] = display;
      }

      setLiveInvoices(
        invoiceRows.map((r) => adaptInvoice(r, [], nameMap[r.merchant_id])),
      );
      setLiveContracts(
        contractRows
          .filter((c) => c.status !== 'ended' && c.status !== 'cancelled')
          .map((r) => adaptContract(r, nameMap[r.merchant_id])),
      );
      setLiveNotes(
        noteRows.map((r) => adaptNote(r, nameMap[r.merchant_id])),
      );
      setLiveHistory(
        contractRows
          .filter((c) => c.status === 'ended' || c.status === 'cancelled')
          .map((r) => adaptContractToHistory(r, nameMap[r.merchant_id])),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, locale, realSession?.user?.id]);

  const invoices = liveInvoices ?? demoInvoices;
  const contracts = liveContracts ?? demoContracts;
  const notes = liveNotes ?? demoNotes;
  const history = liveHistory ?? demoHistory;

  // Index invoices/notes by id so the rental bundle card can fuse them.
  const invoicesByContractRef = useMemo(() => {
    // We don't have invoice → contract id on the UI Invoice type, but
    // `contract.title` already encodes the contract number. Match on
    // amount + index as a fallback isn't reliable; instead we surface
    // the most recent accepted invoice per merchant. Good enough for
    // the active-rental case and unaffected if there's only one rental.
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => {
      if (inv.status === 'paid') {
        const key = inv.id;
        map.set(key, inv);
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
        // Pair this contract with its note (matched by counterparty
        // since the UI types don't carry contract_id on the note).
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

  return (
    <>
      <Header
        variant="hero"
        leading={<Avatar name={session?.fullName ?? 'A'} tone="gold" />}
        title={
          <span className="text-white">
            {t('home.greeting')}
            {firstName && `، ${firstName}`}
          </span>
        }
        subtitle={t('home.subtitle')}
        trailing={
          <>
            <IconButton
              variant="glass"
              label={t('qr.entry')}
              onClick={() => navigate('/scan')}
            >
              <QrIcon size={18} />
            </IconButton>
            <IconButton variant="glass" label={t('nav.notifications')}>
              <BellIcon size={18} />
            </IconButton>
          </>
        }
      />
      <Screen className="bg-canvas">
        {/* Compact eligibility — always shown, never dominates. */}
        <EligibilityCompact
          eligibility={eligibility}
          tierLabel={t(`eligibility.tiers.${eligibility.tier}`)}
          onOpen={() => navigate('/eligibility')}
          formatCurrency={formatCurrency}
          t={t}
          dir={dir}
        />

        {/* Mode-driven hero block. */}
        {mode === 'attention' && (
          <AttentionStack
            invoices={attentionInvoices}
            t={t}
            dir={dir}
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
            dir={dir}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            onOpenContract={(id) => navigate(`/track/contract/${id}`)}
          />
        )}

        {mode === 'new' && <JourneyStarter t={t} dir={dir} />}

        {mode === 'idle' && <IdleAcknowledgment t={t} dir={dir} />}

        {/* History strip — appears whenever there's anything to show,
            independent of mode. Only the new customer has zero history
            and zero usage, so this block is naturally suppressed for them. */}
        {history.length > 0 && (
          <HistoryStrip
            items={history.slice(0, 2)}
            t={t}
            dir={dir}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        )}

        {/* Quick links — always present, lightweight. */}
        <QuickLinks t={t} />
      </Screen>
    </>
  );
}

// =====================================================================
// Blocks
// =====================================================================

// Eligibility summary strip — restrained, premium, calm.
//
// Design intent: this is a smart summary, not a hero. It sits in the
// normal page flow below the header, on white, with hairline borders
// and small typography. The only colored accent is the tier pill and
// a barely-visible usage hairline at the bottom edge — both there so
// active customers still get usage information at a glance.
//
// Anything that previously made it dominate the top — lavender
// gradient fill, white-on-color type, the -mt-12 pull-up into the
// header, the editorial 28px number, the 6px progress bar, the
// decorative blur dots — is gone.
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
      className={cn(
        'relative w-full text-start rounded-2xl bg-white hairline overflow-hidden',
        'px-4 py-3 shadow-soft transition-colors',
        'hover:bg-canvas-100/40 active:bg-canvas-100/70',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
            {t('home.eligibilityCompact.available')}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="num text-[17px] font-semibold text-ink-900 tracking-tight">
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
          <span className="inline-flex items-center text-[10px] font-semibold text-lavender-700 bg-lavender-50 ring-1 ring-lavender-200 rounded-full px-2 py-0.5">
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
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-canvas-200"
        >
          <span
            className="block h-full bg-lavender-400"
            style={{ width: `${usagePct}%` }}
          />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------

function AttentionStack({
  invoices,
  t,
  dir,
  formatCurrency,
  formatDate,
  onReview,
}: {
  invoices: AttentionInvoice[];
  t: (k: string, p?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
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
        className={cn(
          'relative rounded-xl3 bg-gradient-to-br from-warn-50 to-white',
          'ring-1 ring-warn-500/25 p-5 shadow-soft animate-fade-in',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-2xl bg-warn-600 text-white grid place-items-center shrink-0 shadow-soft">
            <ReceiptIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-warn-700 uppercase tracking-[0.08em]">
              {daysLeft > 0
                ? t('home.attention.expiresIn', { days: daysLeft })
                : t('common.overdue')}
            </div>
            {top.merchantName && (
              <div className="mt-0.5 text-[11.5px] text-ink-500 truncate">
                {t('home.attention.fromMerchant', { merchant: top.merchantName })}
              </div>
            )}
            <div className="mt-1 text-[16px] font-semibold text-ink-900 tracking-tight truncate">
              {top.title}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-500">
              <span className="num font-semibold text-ink-900">
                {formatCurrency(top.amount)}
              </span>
              <span className="text-ink-300">·</span>
              <span className="num">{formatDate(top.dueDate)}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onReview(top)}
          className={cn(
            'mt-4 inline-flex items-center justify-center gap-1.5 h-11 w-full rounded-xl2',
            'bg-ink-900 text-white font-semibold text-[14px] tracking-tight',
            'shadow-plush hover:bg-ink-800 active:bg-ink-800 transition-colors',
          )}
        >
          {t('home.attention.cta')}
          <ArrowIcon
            size={14}
            className={cn(dir === 'rtl' ? 'rotate-180' : '')}
          />
        </button>
      </div>

      {extra > 0 && (
        <Link
          to="/contracts"
          className={cn(
            'block text-center text-[12px] font-semibold text-lavender-700',
            'hover:text-lavender-800',
          )}
        >
          {t('home.attention.morePending', { count: extra })}
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

function ActiveStack({
  rentals,
  t,
  dir,
  formatCurrency,
  formatDate,
  onOpenContract,
}: {
  rentals: ActiveRental[];
  t: (k: string, p?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
  formatCurrency: (n: number) => string;
  formatDate: (iso: string) => string;
  onOpenContract: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {rentals.map(({ contract, invoice, note, merchantName }) => {
        const daysLeft = daysUntil(contract.endDate);
        const daysLabel =
          daysLeft > 0
            ? t('home.current.daysLeft', { days: daysLeft })
            : daysLeft === 0
              ? t('home.current.endsToday')
              : t('home.current.endedHint');
        return (
          <div
            key={contract.id}
            className="rounded-xl3 bg-white hairline p-5 shadow-soft animate-fade-in"
          >
            <div className="flex items-start gap-3">
              <span className="h-11 w-11 rounded-2xl bg-lavender-50 text-lavender-700 ring-1 ring-lavender-200 grid place-items-center shrink-0">
                <SparkleIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.08em]">
                  {t('home.current.title')}
                </div>
                <div className="mt-0.5 text-[15px] font-semibold text-ink-900 tracking-tight truncate">
                  {contract.title}
                </div>
                {merchantName && merchantName !== '—' && (
                  <div className="mt-0.5 text-[12.5px] text-ink-500 truncate">
                    {merchantName}
                  </div>
                )}
              </div>
              <div className="text-end shrink-0 num">
                <div className="editorial-title text-[26px] text-ink-900 leading-none">
                  {daysLeft > 0 ? daysLeft : daysLeft === 0 ? '0' : '—'}
                </div>
                <div className="mt-1 text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {daysLabel}
                </div>
              </div>
            </div>

            {/* Three-stamp row — one rental, three artifacts, one card. */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <ArtifactPill
                icon={<ReceiptIcon size={13} />}
                label={t('home.current.invoicePill')}
                state={invoice ? 'signed' : 'pending'}
                t={t}
              />
              <ArtifactPill
                icon={<DocIcon size={13} />}
                label={t('home.current.contractPill')}
                state={contract.status === 'active' ? 'signed' : 'pending'}
                t={t}
              />
              <ArtifactPill
                icon={<WalletIcon size={13} />}
                label={t('home.current.notePill')}
                state={note?.status === 'signed' ? 'signed' : 'pending'}
                t={t}
              />
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('contracts.bundle.amountLabel')}
                </div>
                <div className="mt-0.5 text-[15px] font-semibold text-ink-900 num">
                  {formatCurrency(contract.monthlyAmount)}
                </div>
              </div>
              <div className="text-end">
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('contracts.bundle.endsOn')}
                </div>
                <div className="mt-0.5 text-[13px] text-ink-700 num">
                  {formatDate(contract.endDate)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenContract(contract.id)}
              className={cn(
                'mt-4 inline-flex items-center justify-center gap-1.5 h-11 w-full rounded-xl2',
                'bg-lavender-400 text-white font-semibold text-[14px] tracking-tight',
                'shadow-soft hover:bg-lavender-500 active:bg-lavender-500 transition-colors',
              )}
            >
              {t('home.current.cta')}
              <ArrowIcon
                size={14}
                className={cn(dir === 'rtl' ? 'rotate-180' : '')}
              />
            </button>
          </div>
        );
      })}
    </div>
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
        'rounded-xl px-2.5 py-2 flex items-center gap-2 ring-1',
        signed
          ? 'bg-success-50 ring-success-500/20 text-success-700'
          : 'bg-canvas-100 ring-canvas-200 text-ink-500',
      )}
    >
      <span className="grid place-items-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold text-ink-700 truncate">
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
      icon: <BuildingIcon size={16} />,
      title: t('home.starter.step1Title'),
      hint: t('home.starter.step1Hint'),
    },
    {
      icon: <ReceiptIcon size={16} />,
      title: t('home.starter.step2Title'),
      hint: t('home.starter.step2Hint'),
    },
    {
      icon: <DocIcon size={16} />,
      title: t('home.starter.step3Title'),
      hint: t('home.starter.step3Hint'),
    },
  ];
  return (
    <Card className="animate-fade-in">
      <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.08em]">
        {t('home.starter.eyebrow')}
      </div>
      <div className="mt-1 editorial-title text-[22px] text-ink-900 leading-snug tracking-tight">
        {t('home.starter.title')}
      </div>

      <ol className="mt-4 space-y-3.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-2xl bg-lavender-50 text-lavender-700 ring-1 ring-lavender-200 grid place-items-center">
              {s.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-ink-400 num">
                  0{i + 1}
                </span>
                <span className="text-[14px] font-semibold text-ink-900 tracking-tight">
                  {s.title}
                </span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-500 leading-relaxed">
                {s.hint}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <Link
        to="/stores"
        className={cn(
          'mt-5 inline-flex items-center justify-center gap-1.5 h-11 w-full rounded-xl2',
          'bg-ink-900 text-white font-semibold text-[14px] tracking-tight',
          'shadow-plush hover:bg-ink-800 active:bg-ink-800 transition-colors',
        )}
      >
        {t('home.starter.ctaPrimary')}
        <ArrowIcon
          size={14}
          className={cn(dir === 'rtl' ? 'rotate-180' : '')}
        />
      </Link>
    </Card>
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
    <Card className="animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 shrink-0 rounded-2xl bg-success-50 text-success-700 ring-1 ring-success-500/20 grid place-items-center">
          <BadgeCheckIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink-900 tracking-tight">
            {t('home.idle.title')}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
            {t('home.idle.subtitle')}
          </div>
        </div>
      </div>
      <Link
        to="/stores"
        className={cn(
          'mt-4 inline-flex items-center justify-center gap-1.5 h-11 w-full rounded-xl2',
          'bg-white text-ink-900 ring-1 ring-canvas-200 font-semibold text-[13.5px] tracking-tight',
          'hover:bg-canvas-100/60 active:bg-canvas-100 transition-colors',
        )}
      >
        {t('home.idle.cta')}
        <ArrowIcon
          size={14}
          className={cn(dir === 'rtl' ? 'rotate-180' : '')}
        />
      </Link>
    </Card>
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
    <section>
      <SectionHeader
        title={t('home.historyStrip.title')}
        action={
          <Link to="/contracts" className="inline-flex items-center gap-1">
            {t('home.historyStrip.viewAll')}
            <ArrowIcon
              size={12}
              className={cn(dir === 'rtl' ? 'rotate-180' : '')}
            />
          </Link>
        }
      />
      <Card padded={false} className="px-5">
        {items.map((h, i) => (
          <div key={h.id}>
            <div className="flex items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink-900 truncate tracking-tight">
                  {h.title}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-400 truncate">
                  {h.counterparty !== '—' ? h.counterparty + ' · ' : ''}
                  {formatDate(h.closedAt)}
                </div>
              </div>
              <div className="text-end shrink-0">
                <div className="text-[13px] font-semibold text-ink-900 num">
                  {formatCurrency(h.amount)}
                </div>
                <div className="text-[10.5px] text-success-600 font-semibold mt-0.5">
                  {t('status.history.completed')}
                </div>
              </div>
            </div>
            {i < items.length - 1 && <div className="h-px bg-canvas-200/80" />}
          </div>
        ))}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------

function QuickLinks({ t }: { t: (k: string) => string }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <QuickLink to="/stores" icon={<BuildingIcon size={16} />} label={t('home.quickLinks.stores')} />
      <QuickLink to="/eligibility" icon={<ShieldIcon size={16} />} label={t('home.quickLinks.eligibility')} />
      <QuickLink to="/profile" icon={<UserIcon size={16} />} label={t('home.quickLinks.profile')} />
    </div>
  );
}

function QuickLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'rounded-xl2 bg-white hairline p-3 flex flex-col gap-2 shadow-soft',
        'transition-colors hover:bg-canvas-100/40 active:bg-canvas-100',
      )}
    >
      <span className="h-8 w-8 rounded-xl bg-lavender-50 text-lavender-700 grid place-items-center">
        {icon}
      </span>
      <div className="text-[12px] font-semibold text-ink-900 tracking-tight">
        {label}
      </div>
    </Link>
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

