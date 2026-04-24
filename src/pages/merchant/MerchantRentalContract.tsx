import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, SectionHeader, StatusChip } from '@/components/ui';
import {
  BadgeCheckIcon,
  CarIcon,
  DocIcon,
  InfoIcon,
  ShieldIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { SEED_SCANS } from '@/lib/data';
import { toneForDocState } from './MerchantRentalDetails';

export default function MerchantRentalContract() {
  const t = useT();
  const { formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals, merchant } = useStore();

  const rental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );

  if (!rental) {
    return <Navigate to="/merchant/rentals" replace />;
  }

  const durationDays = (() => {
    const s = new Date(rental.startDate).getTime();
    const e = new Date(rental.endDate).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
  })();
  const clauses = SEED_SCANS[0]?.contract.clauses ?? [];
  const readyAt = rental.timeline.find((e) => e.key === 'contract-ready')?.at;
  const signedAt = rental.timeline.find((e) => e.key === 'nafith-approved')?.at;

  return (
    <>
      <Header
        title={t('merchant.rental.contract.title')}
        subtitle={rental.contractRef}
        showBack
        trailing={
          <StatusChip
            tone={toneForDocState(rental.contractState)}
            dot
            label={t(`merchant.rental.docs.state.${rental.contractState}`)}
          />
        }
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 text-white grid place-items-center">
                <DocIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                  {t('merchant.rental.contract.refLabel')}
                </div>
                <div className="mt-0.5 text-[16px] font-bold num truncate">
                  {rental.contractRef}
                </div>
                <div className="mt-1 text-[12px] text-white/70 truncate">
                  {rental.item}
                </div>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.contract.startOn')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {formatDate(rental.startDate)}
                </div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.contract.endOn')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {formatDate(rental.endDate)}
                </div>
              </div>
            </div>
          </div>

          {/* Parties */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.parties')}
              className="mb-0"
            />
            <Row
              label={t('merchant.rental.contract.lessor')}
              value={merchant?.companyName ?? ''}
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.contract.lessee')}
              value={rental.customerName}
              sub={<span className="num">+966{rental.customerMobile}</span>}
            />
          </Card>

          {/* Key terms */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.keyTerms')}
              className="mb-0"
            />
            <div className="grid grid-cols-2 gap-3">
              <Stat
                icon={<CarIcon size={14} />}
                label={t('merchant.rental.contract.item')}
                value={rental.item}
              />
              <Stat
                label={t('merchant.rental.contract.rentalFee')}
                value={
                  <span className="num">{formatCurrency(rental.monthlyAmount)}</span>
                }
              />
              <Stat
                label={t('merchant.rental.contract.duration')}
                value={
                  <span className="num">
                    {t('merchant.rentals.rentalPeriod', { count: durationDays })}
                  </span>
                }
              />
              <Stat
                label={t('merchant.rental.contract.itemValue')}
                value={
                  <span className="num">{formatCurrency(rental.itemValue)}</span>
                }
              />
            </div>
          </Card>

          {/* Clauses summary */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.clauses')}
              className="mb-0"
              action={
                <span className="text-[12px] text-ink-400">
                  {t('merchant.rental.contract.clausesCount', {
                    count: clauses.length,
                  })}
                </span>
              }
            />
            <ol className="space-y-2.5 list-none p-0 m-0">
              {clauses.map((c, idx) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-canvas-100 text-ink-700 grid place-items-center text-[11px] font-semibold num">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink-900">
                      {c.title[locale]}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-ink-600 leading-relaxed">
                      {c.body[locale]}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {/* Readiness */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.readiness')}
              className="mb-0"
            />
            <Row
              label={t('merchant.rental.contract.readyAt')}
              value={
                readyAt ? (
                  <span className="num">
                    {formatDate(readyAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                ) : (
                  t('merchant.rental.timeline.pending')
                )
              }
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.contract.signedAt')}
              value={
                signedAt ? (
                  <span className="num">
                    {formatDate(signedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                ) : (
                  t('merchant.rental.timeline.pending')
                )
              }
            />
          </Card>

          {/* Nafith placeholder */}
          <div className="rounded-xl2 bg-gold-50 hairline p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-gold-700 grid place-items-center ring-1 hairline">
              <BadgeCheckIcon size={18} />
            </span>
            <div className="min-w-0 text-[12px] text-brand-800/90 leading-relaxed">
              <div className="flex items-center gap-1.5 text-brand-900 font-semibold mb-0.5">
                <ShieldIcon size={12} />
                {t('track.placeholders.nafith')}
              </div>
              {t('track.placeholders.nafithDesc')}
            </div>
          </div>

          <Button
            variant="secondary"
            block
            leading={<InfoIcon size={16} />}
            onClick={() => navigate(`/merchant/rentals/${rental.id}`)}
          >
            {t('merchant.rental.actions.backToRental')}
          </Button>
        </div>
      </Screen>
    </>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-400 num">{sub}</div>}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl2 bg-canvas-100 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[13.5px] font-semibold text-ink-900 truncate">
        {value}
      </div>
    </div>
  );
}
