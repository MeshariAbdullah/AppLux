import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Avatar,
  Card,
  EmptyState,
  IconButton,
  SectionHeader,
} from '@/components/ui';
import {
  ArrowIcon,
  BellIcon,
  DocIcon,
  HistoryIcon,
  QrIcon,
  ReceiptIcon,
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
  listCustomerContracts,
  listCustomerInvoices,
  listCustomerNotes,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, HistoryItem, Invoice, PromissoryNote } from '@/lib/data';
import { cn } from '@/lib/cn';
import {
  ContractRow,
  HistoryRow,
  InvoiceRow,
  NoteRow,
} from '@/components/rental/Rows';
import type { ReactNode } from 'react';

export default function Home() {
  const t = useT();
  const { dir, formatCurrency } = useI18n();
  const { session, eligibility: demoEligibility, invoices: demoInvoices, contracts: demoContracts, notes: demoNotes, history: demoHistory } = useStore();
  const { configured, eligibility: dbEligibility, profile, session: realSession } = useSupabaseAuth();
  const navigate = useNavigate();

  // Real eligibility from Supabase when configured + present; otherwise demo seed.
  const eligibility =
    configured && dbEligibility ? adaptEligibility(dbEligibility) : demoEligibility;

  const fullName = profile?.full_name ?? session?.fullName ?? '';
  const firstName = fullName.split(' ')[0] ?? '';
  const usagePct =
    eligibility.limit > 0
      ? Math.round((eligibility.used / eligibility.limit) * 100)
      : 0;

  // Pull live customer rentals when configured.
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
      setLiveInvoices(invoiceRows.map((r) => adaptInvoice(r)));
      setLiveContracts(
        contractRows
          .filter((c) => c.status !== 'ended' && c.status !== 'cancelled')
          .map((r) => adaptContract(r)),
      );
      setLiveNotes(noteRows.map((r) => adaptNote(r)));
      setLiveHistory(
        contractRows
          .filter((c) => c.status === 'ended' || c.status === 'cancelled')
          .map((r) => adaptContractToHistory(r)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, realSession?.user?.id]);

  const invoices = liveInvoices ?? demoInvoices;
  const contracts = liveContracts ?? demoContracts;
  const notes = liveNotes ?? demoNotes;
  const history = liveHistory ?? demoHistory;

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
        {/* Eligibility summary card — soft lavender surface */}
        <div className="-mt-12 relative rounded-xl3 bg-gradient-to-br from-lavender-300 via-lavender-400 to-lavender-500 text-white p-6 shadow-plush overflow-hidden">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-12 end-[-12%] h-44 w-44 rounded-full bg-white/15 blur-3xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-12 start-[-15%] h-40 w-40 rounded-full bg-lavender-700/20 blur-3xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white/80 uppercase tracking-[0.08em]">
                {t('home.eligibilityTitle')}
              </div>
              <div className="text-[12.5px] text-white/70 mt-1">
                {t('home.eligibilitySub')}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-lavender-700 bg-white rounded-full px-2.5 py-1 shadow-soft">
              {t(`eligibility.tiers.${eligibility.tier}`)}
            </span>
          </div>

          <div className="relative mt-5">
            <div className="text-[10.5px] font-semibold text-white/75 uppercase tracking-[0.08em]">
              {t('home.remaining')}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="editorial-title text-[40px] text-white num leading-none">
                {formatCurrency(eligibility.remaining)}
              </span>
            </div>
            <div className="mt-1.5 text-[12px] text-white/70 num">
              {t('home.of')} {formatCurrency(eligibility.limit)}
            </div>
          </div>

          <div className="relative mt-5">
            <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/95 transition-[width]"
                style={{ width: `${Math.min(100, usagePct)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11.5px]">
              <span className="text-white/75">
                {t('home.used')}{' '}
                <span className="text-white font-semibold num">
                  {formatCurrency(eligibility.used)}
                </span>{' '}
                <span className="text-white/55 num">({usagePct}%)</span>
              </span>
              <button
                type="button"
                onClick={() => navigate('/eligibility')}
                className="inline-flex items-center gap-1 text-white font-semibold hover:text-white/85"
              >
                {t('home.viewDetails')}
                <ArrowIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
              </button>
            </div>
          </div>
        </div>

        {/* Scan CTA — editorial dark band */}
        <button
          type="button"
          onClick={() => navigate('/scan')}
          className="group relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white px-5 py-4 text-start flex items-center gap-4 shadow-card hover:shadow-plush transition-shadow"
        >
          <span aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-20" />
          <span aria-hidden className="pointer-events-none absolute -top-8 end-[-10%] h-32 w-32 rounded-full bg-gold-400/15 blur-3xl" />
          <span className="relative h-12 w-12 rounded-2xl bg-white/8 ring-1 ring-white/12 grid place-items-center shrink-0 text-gold-300">
            <QrIcon size={20} />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[15px] font-semibold truncate tracking-tight">{t('qr.title')}</span>
            <span className="block mt-1 text-[12.5px] text-white/65 truncate">
              {t('qr.subtitle')}
            </span>
          </span>
          <ArrowIcon size={18} className={cn('relative text-white/60', dir === 'rtl' ? 'rotate-180' : '')} />
        </button>

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2.5">
          <SummaryChip
            label={t('home.summaryInvoices')}
            value={invoices.length}
            icon={<ReceiptIcon size={16} />}
            tone="bg-canvas-100 text-ink-700"
          />
          <SummaryChip
            label={t('home.summaryContracts')}
            value={contracts.length}
            icon={<DocIcon size={16} />}
            tone="bg-canvas-100 text-ink-700"
          />
          <SummaryChip
            label={t('home.summaryNotes')}
            value={notes.length}
            icon={<WalletIcon size={16} />}
            tone="bg-gold-50 text-gold-700"
          />
        </div>

        {/* Active rental invoices */}
        <Section
          title={t('sections.activeInvoices')}
          viewAllHref="/contracts"
          t={t}
          empty={
            invoices.length === 0 ? (
              <EmptyState
                icon={<ReceiptIcon size={20} />}
                title={t('sections.noInvoices')}
                description={t('sections.emptyHint')}
              />
            ) : null
          }
        >
          {invoices.slice(0, 3).map((inv, i, arr) => (
            <div key={inv.id}>
              <InvoiceRow invoice={inv} />
              {i < arr.length - 1 && <div className="h-px bg-canvas-200/80" />}
            </div>
          ))}
        </Section>

        {/* Active contracts */}
        <Section
          title={t('sections.activeContracts')}
          viewAllHref="/contracts"
          t={t}
          empty={
            contracts.length === 0 ? (
              <EmptyState
                icon={<DocIcon size={20} />}
                title={t('sections.noContracts')}
                description={t('sections.emptyHint')}
              />
            ) : null
          }
        >
          {contracts.slice(0, 3).map((c, i, arr) => (
            <div key={c.id}>
              <ContractRow contract={c} />
              {i < arr.length - 1 && <div className="h-px bg-canvas-200/80" />}
            </div>
          ))}
        </Section>

        {/* Active promissory notes */}
        <Section
          title={t('sections.activeNotes')}
          viewAllHref="/contracts"
          t={t}
          empty={
            notes.length === 0 ? (
              <EmptyState
                icon={<WalletIcon size={20} />}
                title={t('sections.noNotes')}
                description={t('sections.emptyHint')}
              />
            ) : null
          }
        >
          {notes.slice(0, 3).map((n, i, arr) => (
            <div key={n.id}>
              <NoteRow note={n} />
              {i < arr.length - 1 && <div className="h-px bg-canvas-200/80" />}
            </div>
          ))}
        </Section>

        {/* Previous rental history preview */}
        <Section
          title={t('sections.history')}
          viewAllHref="/contracts"
          t={t}
          empty={
            history.length === 0 ? (
              <EmptyState
                icon={<HistoryIcon size={20} />}
                title={t('sections.noHistory')}
                description={t('sections.emptyHint')}
              />
            ) : null
          }
        >
          {history.slice(0, 3).map((h, i, arr) => (
            <div key={h.id}>
              <HistoryRow item={h} />
              {i < arr.length - 1 && <div className="h-px bg-canvas-200/80" />}
            </div>
          ))}
        </Section>
      </Screen>
    </>
  );
}

function SummaryChip({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl2 bg-white hairline p-3.5 flex flex-col gap-3 shadow-soft">
      <span className={cn('h-9 w-9 rounded-2xl grid place-items-center', tone)}>{icon}</span>
      <div>
        <div className="editorial-title text-[22px] text-ink-900 num leading-none">{value}</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.06em] text-ink-400 font-medium">
          {label}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  viewAllHref,
  children,
  empty,
  t,
}: {
  title: string;
  viewAllHref: string;
  children: ReactNode;
  empty: ReactNode;
  t: (k: string) => string;
}) {
  return (
    <section>
      <SectionHeader
        title={title}
        action={
          empty ? null : (
            <Link to={viewAllHref}>{t('home.viewAll')}</Link>
          )
        }
      />
      {empty ? (
        empty
      ) : (
        <Card padded={false} className="px-5">
          {children}
        </Card>
      )}
    </section>
  );
}
