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
    .reduce((sum, c) => sum + c.monthlyAmount, 0);
  const outstandingInvoices = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
      <Header title={t('eligibility.title')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-6">
          {/* Hero eligibility card */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-18%] h-56 w-56 rounded-full bg-gold-400/22 blur-[100px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 start-[-10%] h-48 w-48 rounded-full bg-gold-500/12 blur-[100px]"
            />

            <div className="relative flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold">
                <SparkleIcon size={12} />
                {t(`eligibility.tiers.${eligibility.tier}`)}
              </span>
              <span className="text-[11.5px] text-white/55">
                {t('eligibility.usageOfLimit')} · <span className="num">{usagePct}%</span>
              </span>
            </div>

            <div className="relative mt-7">
              <div className="text-[11.5px] text-white/55 uppercase tracking-[0.08em]">
                {t('eligibility.remaining')}
              </div>
              <div className="mt-2 editorial-title text-[40px] leading-none num text-white">
                {formatCurrency(eligibility.remaining)}
              </div>
              <div className="mt-2 text-[12.5px] text-white/55">
                {t('home.of')}{' '}
                <span className="num text-white/85">{formatCurrency(eligibility.limit)}</span>
              </div>
            </div>

            <div className="relative mt-6">
              <ProgressBar
                value={eligibility.used}
                max={eligibility.limit}
                tone="white"
                className="bg-white/12"
              />
              <div className="mt-3 flex justify-between text-[11.5px] text-white/65">
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
              tone="default"
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
              tone="gold"
              label={t('eligibility.remaining')}
              value={formatCurrency(eligibility.remaining)}
              icon={<SparkleIcon size={18} />}
            />
          </div>

          {/* Breakdown */}
          <Card padded>
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-ink-900 tracking-tight">
                {t('eligibility.breakdown')}
              </h3>
              <StatusChip tone="neutral" dot={false} label={t(`eligibility.tiers.${eligibility.tier}`)} />
            </div>

            {eligibility.used === 0 ? (
              <div className="mt-4 text-[12.5px] text-ink-400">{t('eligibility.noUsage')}</div>
            ) : (
              <div className="mt-5 space-y-4">
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
          <Card padded className="bg-gold-50">
            <div className="flex items-start gap-3.5">
              <span className="h-10 w-10 rounded-2xl bg-white text-gold-700 grid place-items-center hairline shrink-0">
                <InfoIcon size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink-900 tracking-tight">
                  {t('eligibility.adminNotice')}
                </div>
                <dl className="mt-3.5 grid grid-cols-2 gap-3 text-[12px]">
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
      <div className="mt-2 flex items-center gap-2.5">
        <ProgressBar value={percent} tone={tone} size="sm" />
        <span
          className={cn(
            'text-[11px] font-semibold num w-10 text-end',
            tone === 'brand' ? 'text-ink-700' : 'text-gold-700',
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
      <dt className="text-[10.5px] text-ink-500 uppercase tracking-[0.08em] font-semibold">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
