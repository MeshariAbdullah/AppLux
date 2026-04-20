import { Header, Screen } from '@/components/layout';
import { Card, ProgressBar, StatCard, StatusChip } from '@/components/ui';
import { InfoIcon, ShieldIcon, SparkleIcon, WalletIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export default function Eligibility() {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const { eligibility, contracts, invoices } = useStore();

  const usagePct = Math.round((eligibility.used / eligibility.limit) * 100);
  const contractCommitments = contracts
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + c.monthlyAmount * 12, 0);
  const outstandingInvoices = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
      <Header title={t('eligibility.title')} showBack />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-5">
          {/* Hero eligibility card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-float">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-30" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-52 w-52 rounded-full bg-brand-500/25 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 start-[-10%] h-48 w-48 rounded-full bg-gold-500/15 blur-3xl"
            />

            <div className="relative flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11.5px] font-semibold">
                <SparkleIcon size={12} />
                {t(`eligibility.tiers.${eligibility.tier}`)}
              </span>
              <span className="text-[11.5px] text-white/60">
                {t('eligibility.usageOfLimit')} · <span className="num">{usagePct}%</span>
              </span>
            </div>

            <div className="relative mt-6">
              <div className="text-[12px] text-white/60">{t('eligibility.remaining')}</div>
              <div className="mt-1 text-[36px] leading-none font-bold num">
                {formatCurrency(eligibility.remaining)}
              </div>
              <div className="mt-1.5 text-[12.5px] text-white/60">
                {t('home.of')}{' '}
                <span className="num text-white/90">{formatCurrency(eligibility.limit)}</span>
              </div>
            </div>

            <div className="relative mt-5">
              <ProgressBar
                value={eligibility.used}
                max={eligibility.limit}
                tone="white"
                className="bg-white/15"
              />
              <div className="mt-3 flex justify-between text-[11.5px] text-white/70">
                <span>
                  {t('eligibility.used')}{' '}
                  <span className="font-semibold text-white num">
                    {formatCurrency(eligibility.used)}
                  </span>
                </span>
                <span>
                  {t('eligibility.limit')}{' '}
                  <span className="font-semibold text-white num">
                    {formatCurrency(eligibility.limit)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <StatCard
              tone="brand"
              label={t('eligibility.limit')}
              value={formatCurrency(eligibility.limit)}
              icon={<ShieldIcon size={18} />}
            />
            <StatCard
              tone="warn"
              label={t('eligibility.used')}
              value={formatCurrency(eligibility.used)}
              icon={<WalletIcon size={18} />}
            />
            <StatCard
              tone="success"
              label={t('eligibility.remaining')}
              value={formatCurrency(eligibility.remaining)}
              icon={<SparkleIcon size={18} />}
            />
          </div>

          {/* Breakdown */}
          <Card padded>
            <div className="flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold text-ink-900">
                {t('eligibility.breakdown')}
              </h3>
              <StatusChip tone="neutral" dot={false} label={t(`eligibility.tiers.${eligibility.tier}`)} />
            </div>

            {eligibility.used === 0 ? (
              <div className="mt-3 text-[12.5px] text-ink-400">{t('eligibility.noUsage')}</div>
            ) : (
              <div className="mt-4 space-y-4">
                <BreakdownRow
                  label={t('eligibility.contractsShare')}
                  value={formatCurrency(contractCommitments)}
                  percent={Math.round(Math.min(100, (contractCommitments / eligibility.limit) * 100))}
                  tone="brand"
                />
                <BreakdownRow
                  label={t('eligibility.invoicesShare')}
                  value={formatCurrency(outstandingInvoices)}
                  percent={Math.round(Math.min(100, (outstandingInvoices / eligibility.limit) * 100))}
                  tone="gold"
                />
              </div>
            )}
          </Card>

          {/* Admin notice */}
          <Card padded className="bg-brand-50/70 ring-brand-100">
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-xl bg-white text-brand-600 grid place-items-center ring-1 ring-brand-100 shrink-0">
                <InfoIcon size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-brand-900">
                  {t('eligibility.adminNotice')}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                  <InfoPair label={t('eligibility.assignedBy')} value={eligibility.assignedBy} />
                  <InfoPair
                    label={t('eligibility.assignedOn')}
                    value={formatDate(eligibility.assignedAt)}
                  />
                </dl>
              </div>
            </div>
          </Card>
        </div>
      </Screen>
    </>
  );
}

function BreakdownRow({
  label,
  value,
  percent,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  percent: number;
  tone: 'brand' | 'gold';
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-ink-600 font-medium">{label}</span>
        <span className="text-[12.5px] font-semibold text-ink-900 num">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <ProgressBar value={percent} tone={tone} size="sm" />
        <span
          className={cn(
            'text-[11px] font-semibold num w-10 text-end',
            tone === 'brand' ? 'text-brand-600' : 'text-gold-600',
          )}
        >
          {percent}%
        </span>
      </div>
    </div>
  );
}

function InfoPair({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-brand-900/60 uppercase tracking-wide font-medium">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-brand-900">{value}</dd>
    </div>
  );
}
