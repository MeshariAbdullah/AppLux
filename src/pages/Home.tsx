import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Avatar,
  Card,
  EmptyState,
  IconButton,
  ProgressBar,
  SectionHeader,
  StatusChip,
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
  const { session, eligibility, invoices, contracts, notes, history } = useStore();
  const navigate = useNavigate();

  const firstName = session?.fullName?.split(' ')[0] ?? '';
  const usagePct = Math.round((eligibility.used / eligibility.limit) * 100);

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
      <Screen>
        {/* Eligibility summary card */}
        <Card padded className="-mt-10 relative space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-ink-400 uppercase tracking-wide">
                {t('home.eligibilityTitle')}
              </div>
              <div className="text-[12.5px] text-ink-500 mt-0.5">
                {t('home.eligibilitySub')}
              </div>
            </div>
            <StatusChip
              tone="gold"
              dot={false}
              label={t(`eligibility.tiers.${eligibility.tier}`)}
            />
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold text-ink-900 num leading-none">
                {formatCurrency(eligibility.remaining)}
              </span>
              <span className="text-[12px] text-ink-400">{t('home.remaining')}</span>
            </div>
            <div className="mt-1 text-[12px] text-ink-400">
              {t('home.of')} {formatCurrency(eligibility.limit)}
            </div>
          </div>

          <div>
            <ProgressBar value={eligibility.used} max={eligibility.limit} tone="brand" />
            <div className="mt-2 flex items-center justify-between text-[11.5px]">
              <span className="text-ink-500">
                {t('home.used')}{' '}
                <span className="text-ink-900 font-semibold num">
                  {formatCurrency(eligibility.used)}
                </span>{' '}
                <span className="text-ink-400 num">({usagePct}%)</span>
              </span>
              <button
                type="button"
                onClick={() => navigate('/eligibility')}
                className="inline-flex items-center gap-1 text-brand-600 font-semibold"
              >
                {t('home.viewDetails')}
                <ArrowIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
              </button>
            </div>
          </div>
        </Card>

        {/* Scan CTA */}
        <button
          type="button"
          onClick={() => navigate('/scan')}
          className="group relative overflow-hidden rounded-xl2 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white px-4 py-3.5 text-start flex items-center gap-3 shadow-card hover:shadow-float transition-shadow"
        >
          <span aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-20" />
          <span className="relative h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center shrink-0">
            <QrIcon size={20} />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[14px] font-semibold truncate">{t('qr.title')}</span>
            <span className="block mt-0.5 text-[12px] text-white/70 truncate">
              {t('qr.subtitle')}
            </span>
          </span>
          <ArrowIcon size={18} className={cn('relative text-white/70', dir === 'rtl' ? 'rotate-180' : '')} />
        </button>

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryChip
            label={t('home.summaryInvoices')}
            value={invoices.length}
            icon={<ReceiptIcon size={16} />}
            tone="bg-brand-50 text-brand-600"
          />
          <SummaryChip
            label={t('home.summaryContracts')}
            value={contracts.length}
            icon={<DocIcon size={16} />}
            tone="bg-ink-100 text-ink-700"
          />
          <SummaryChip
            label={t('home.summaryNotes')}
            value={notes.length}
            icon={<WalletIcon size={16} />}
            tone="bg-[#FBF2DD] text-gold-600"
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
              {i < arr.length - 1 && <div className="h-px bg-ink-100" />}
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
              {i < arr.length - 1 && <div className="h-px bg-ink-100" />}
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
              {i < arr.length - 1 && <div className="h-px bg-ink-100" />}
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
              {i < arr.length - 1 && <div className="h-px bg-ink-100" />}
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
    <div className="rounded-xl2 bg-white ring-1 ring-ink-100 p-3 flex flex-col gap-2">
      <span className={cn('h-8 w-8 rounded-lg grid place-items-center', tone)}>{icon}</span>
      <div>
        <div className="text-[18px] font-bold text-ink-900 num leading-none">{value}</div>
        <div className="mt-1 text-[11.5px] text-ink-400">{label}</div>
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
            <Link to={viewAllHref} className="font-medium text-brand-600">
              {t('home.viewAll')}
            </Link>
          )
        }
      />
      {empty ? (
        empty
      ) : (
        <Card padded={false} className="px-4">
          {children}
        </Card>
      )}
    </section>
  );
}
