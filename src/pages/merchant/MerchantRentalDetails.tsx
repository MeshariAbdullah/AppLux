import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, SectionHeader, StatusChip, type StatusTone } from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CarIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  HistoryIcon,
  InfoIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
  SignatureIcon,
  SparkleIcon,
  TimelineIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { deriveJourneyFromMerchantRental } from '@/lib/rentalJourney';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  fetchContractById,
  fetchMerchant,
  fetchProfile,
  useSupabaseAuth,
} from '@/lib/supabase';
import type {
  MerchantNafithState,
  MerchantRental,
  MerchantRentalDocState,
  MerchantRentalStatus,
  MerchantRentalTimelineEvent,
  MerchantRentalTimelineKey,
} from '@/lib/data';

type StageKey =
  | 'created'
  | 'customer-approved'
  | 'documents-ready'
  | 'nafith-submitted'
  | 'nafith-approved'
  | 'activated';

type StageState = 'done' | 'current' | 'pending';

const STAGE_ORDER: StageKey[] = [
  'created',
  'customer-approved',
  'documents-ready',
  'nafith-submitted',
  'nafith-approved',
  'activated',
];

function toneForStatus(status: MerchantRentalStatus): StatusTone {
  if (status === 'overdue') return 'danger';
  if (status === 'due-soon') return 'warn';
  if (status === 'returned') return 'neutral';
  return 'success';
}

function toneForDocState(state: MerchantRentalDocState): StatusTone {
  if (state === 'signed') return 'success';
  if (state === 'sent') return 'brand';
  if (state === 'ready') return 'gold';
  return 'neutral';
}

function toneForNafith(state: MerchantNafithState): StatusTone {
  if (state === 'approved') return 'success';
  if (state === 'submitted') return 'gold';
  return 'neutral';
}

function stageStates(rental: MerchantRental): Record<StageKey, StageState> {
  const hasEvent = (k: MerchantRentalTimelineKey) =>
    rental.timeline.some((e) => e.key === k);
  const contractReady =
    rental.contractState === 'ready' ||
    rental.contractState === 'sent' ||
    rental.contractState === 'signed';
  const noteReady =
    rental.noteState === 'ready' ||
    rental.noteState === 'sent' ||
    rental.noteState === 'signed';
  const both = contractReady && noteReady;

  const raw: Record<StageKey, boolean> = {
    'created': hasEvent('created'),
    'customer-approved': rental.customerApproved || hasEvent('customer-approved'),
    'documents-ready': both,
    'nafith-submitted':
      rental.nafithState === 'submitted' || rental.nafithState === 'approved',
    'nafith-approved': rental.nafithState === 'approved',
    'activated': hasEvent('activated'),
  };

  const out: Record<StageKey, StageState> = {
    'created': 'pending',
    'customer-approved': 'pending',
    'documents-ready': 'pending',
    'nafith-submitted': 'pending',
    'nafith-approved': 'pending',
    'activated': 'pending',
  };
  let foundCurrent = false;
  for (const key of STAGE_ORDER) {
    if (raw[key]) {
      out[key] = 'done';
    } else if (!foundCurrent) {
      out[key] = 'current';
      foundCurrent = true;
    }
  }
  return out;
}

function stageAt(rental: MerchantRental, key: StageKey): string | undefined {
  const matching: MerchantRentalTimelineKey[] =
    key === 'documents-ready' ? ['contract-ready', 'note-ready'] : [key];
  for (const ek of matching) {
    const ev = rental.timeline.find((e) => e.key === ek);
    if (ev) return ev.at;
  }
  return undefined;
}

export default function MerchantRentalDetails() {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals } = useStore();
  const { configured } = useSupabaseAuth();

  const demoRental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );

  const [liveRental, setLiveRental] = useState<MerchantRental | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!configured || !id || demoRental) {
      setLiveRental(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    (async () => {
      const contract = await fetchContractById(id).catch(() => null);
      if (cancelled || !contract) return;
      const [merchant, customer] = await Promise.all([
        fetchMerchant(contract.merchant_id).catch(() => null),
        fetchProfile(contract.customer_user_id).catch(() => null),
      ]);
      if (cancelled) return;
      const customerName = customer?.full_name ?? '—';
      const initialsSource = customerName.trim().split(/\s+/).slice(0, 2);
      setLiveRental(
        adaptContractToMerchantRental(contract, {
          customerName,
          customerInitials:
            initialsSource.map((p) => p[0]?.toUpperCase() ?? '').join('') || '—',
          customerCity: customer?.city ?? '',
          customerMobile: customer?.mobile ?? '',
          headlineItem: `Rental ${contract.contract_number}`,
          category: merchant?.primary_category,
          itemValue: Number(contract.total_amount),
        }),
      );
    })()
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, id, demoRental]);

  const rental = liveRental ?? demoRental;

  if (!rental) {
    if (resolving) return null;
    return <Navigate to="/merchant/rentals" replace />;
  }

  const stages = stageStates(rental);
  const statusTone = toneForStatus(rental.status);
  const closureState: 'active' | 'closed' | 'damaged' =
    rental.closureStatus === 'closed'
      ? 'closed'
      : rental.closureStatus === 'damaged'
        ? 'damaged'
        : 'active';
  const rentalDays = (() => {
    const s = new Date(rental.startDate).getTime();
    const e = new Date(rental.endDate).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
  })();
  const sortedTimeline = [...rental.timeline].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  const activityPreview = sortedTimeline.slice(0, 5);

  return (
    <>
      <Header
        title={rental.id}
        subtitle={rental.customerName}
        showBack
        trailing={
          <StatusChip
            tone={statusTone}
            dot
            label={t(`merchant.rentals.status.${rental.status}`)}
          />
        }
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <RentalJourneyTimeline steps={deriveJourneyFromMerchantRental(rental)} />

          {/* Outcome banner */}
          {closureState !== 'active' && (
            <div
              className={cn(
                'rounded-xl2 p-3.5 ring-1 flex items-start gap-3',
                closureState === 'closed'
                  ? 'bg-success-50 ring-success-500/20'
                  : 'bg-danger-50/70 ring-danger-500/20',
              )}
            >
              <span
                className={cn(
                  'h-10 w-10 shrink-0 rounded-xl grid place-items-center ring-1',
                  closureState === 'closed'
                    ? 'bg-white text-success-600 ring-success-500/20'
                    : 'bg-white text-danger-600 ring-danger-500/20',
                )}
              >
                {closureState === 'closed' ? (
                  <BadgeCheckIcon size={18} />
                ) : (
                  <AlertIcon size={18} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'text-[13.5px] font-semibold',
                    closureState === 'closed'
                      ? 'text-success-700'
                      : 'text-danger-700',
                  )}
                >
                  {t(
                    closureState === 'closed'
                      ? 'merchant.rental.outcome.closedTitle'
                      : 'merchant.rental.outcome.damagedTitle',
                  )}
                </div>
                <div
                  className={cn(
                    'mt-0.5 text-[12px] leading-relaxed',
                    closureState === 'closed'
                      ? 'text-success-700/80'
                      : 'text-danger-700/80',
                  )}
                >
                  {closureState === 'closed'
                    ? rental.closedAt
                      ? t('merchant.rental.outcome.closedOn', {
                          at: formatDate(rental.closedAt, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        })
                      : t('merchant.rental.outcome.closedHint')
                    : t('merchant.rental.outcome.damagedHint')}
                </div>
                {closureState === 'damaged' && rental.damageCaseId && (
                  <Link
                    to={`/merchant/damages/${rental.damageCaseId}`}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-danger-700 hover:underline"
                  >
                    {t('merchant.rental.outcome.openCase')} ·{' '}
                    <span className="num">{rental.damageCaseId}</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-18%] h-52 w-52 rounded-full bg-gold-400/22 blur-[100px]"
            />
            <div className="relative flex items-start gap-4">
              <span className="h-12 w-12 shrink-0 rounded-2xl bg-white/8 ring-1 ring-white/12 text-gold-300 grid place-items-center">
                <CarIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] text-white/55 uppercase tracking-[0.08em]">
                  {t('merchant.rental.hero.current')}
                </div>
                <div className="mt-1.5 editorial-title text-[20px] leading-tight truncate text-white">
                  {rental.item}
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-white/65 truncate">
                  <UsersIcon size={12} />
                  <span className="truncate">{rental.customerName}</span>
                </div>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-3 gap-3 text-[11.5px]">
              <HeroStat
                label={t('merchant.rentals.rentalFee')}
                value={formatCurrency(rental.monthlyAmount)}
              />
              <HeroStat
                label={t('merchant.rentals.rentalPeriodLabel')}
                value={t('merchant.rentals.rentalPeriod', { count: rentalDays })}
              />
              <HeroStat
                label={t('merchant.rentals.returnDate')}
                value={formatDate(rental.endDate)}
              />
            </div>
          </div>

          {/* Customer approval */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.approval.title')}
              className="mb-0"
              action={
                <StatusChip
                  tone={rental.customerApproved ? 'success' : 'warn'}
                  dot
                  label={t(
                    rental.customerApproved
                      ? 'merchant.rental.approval.approved'
                      : 'merchant.rental.approval.awaiting',
                  )}
                />
              }
            />
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'h-10 w-10 shrink-0 rounded-xl grid place-items-center',
                  rental.customerApproved
                    ? 'bg-success-50 text-success-600'
                    : 'bg-warn-50 text-warn-600',
                )}
              >
                {rental.customerApproved ? (
                  <CheckIcon size={18} />
                ) : (
                  <ClockIcon size={18} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                  {rental.customerName}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-400 num truncate">
                  +966{rental.customerMobile}
                </div>
              </div>
            </div>
            {rental.customerApproved && stageAt(rental, 'customer-approved') && (
              <div className="rounded-xl2 bg-success-50/60 ring-1 ring-success-500/15 p-3 text-[12px] text-success-700 flex items-center gap-2">
                <BadgeCheckIcon size={14} />
                <span className="truncate">
                  {t('merchant.rental.approval.approvedOn', {
                    at: formatDate(stageAt(rental, 'customer-approved')!, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </span>
              </div>
            )}
          </Card>

          {/* Documents readiness */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.docs.title')}
              className="mb-0"
              action={
                <span className="text-[12px] text-ink-400">
                  {t('merchant.rental.docs.hint')}
                </span>
              }
            />
            <DocRow
              icon={<DocIcon size={18} />}
              tone="bg-canvas-100 text-ink-700"
              label={t('merchant.rental.docs.contract')}
              refValue={rental.contractRef}
              state={rental.contractState}
              to={`/merchant/rentals/${rental.id}/contract`}
              dir={dir}
            />
            <CardDivider />
            <DocRow
              icon={<SignatureIcon size={18} />}
              tone="bg-gold-50 text-gold-700"
              label={t('merchant.rental.docs.note')}
              refValue={rental.noteRef}
              state={rental.noteState}
              to={`/merchant/rentals/${rental.id}/note`}
              dir={dir}
            />
          </Card>

          {/* Nafith placeholders */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.nafith.title')}
              className="mb-0"
            />
            <p className="text-[12px] text-ink-500 leading-relaxed">
              {t('merchant.rental.nafith.hint')}
            </p>
            <NafithRow
              stepLabel={t('merchant.rental.nafith.submit')}
              stepSub={t('merchant.rental.nafith.submitSub')}
              state={
                rental.nafithState === 'pending' ? 'pending' : 'done'
              }
              at={stageAt(rental, 'nafith-submitted')}
              formatDate={formatDate}
              t={t}
            />
            <CardDivider />
            <NafithRow
              stepLabel={t('merchant.rental.nafith.approve')}
              stepSub={t('merchant.rental.nafith.approveSub')}
              state={
                rental.nafithState === 'approved'
                  ? 'done'
                  : rental.nafithState === 'submitted'
                    ? 'current'
                    : 'pending'
              }
              at={stageAt(rental, 'nafith-approved')}
              formatDate={formatDate}
              t={t}
            />
          </Card>

          {/* Status timeline */}
          <section>
            <SectionHeader
              title={t('merchant.rental.timeline.title')}
              action={
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-400">
                  <TimelineIcon size={14} />
                  {t('merchant.rental.timeline.hint')}
                </span>
              }
            />
            <Card padded>
              <ol className="relative">
                {STAGE_ORDER.map((key, i) => {
                  const state = stages[key];
                  const at = stageAt(rental, key);
                  const isLast = i === STAGE_ORDER.length - 1;
                  const icon = stageIcon(key);
                  return (
                    <li key={key} className="flex items-start gap-3 relative">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            'h-8 w-8 rounded-full grid place-items-center shrink-0 ring-2',
                            state === 'done'
                              ? 'bg-success-500 text-white ring-success-500/25'
                              : state === 'current'
                                ? 'bg-gold-400 text-ink-950 ring-gold-100'
                                : 'bg-canvas-200 text-ink-400 hairline',
                          )}
                        >
                          {state === 'done' ? <CheckIcon size={14} /> : icon}
                        </span>
                        {!isLast && (
                          <span
                            className={cn(
                              'w-px flex-1 my-1 min-h-6',
                              state === 'done' ? 'bg-success-500/30' : 'bg-ink-100',
                            )}
                          />
                        )}
                      </div>
                      <div className={cn('flex-1 min-w-0', !isLast && 'pb-5')}>
                        <div
                          className={cn(
                            'text-[13.5px] font-semibold',
                            state === 'pending' ? 'text-ink-500' : 'text-ink-900',
                          )}
                        >
                          {t(`merchant.rental.timeline.stage.${key}`)}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-400 num">
                          {state === 'done' && at
                            ? formatDate(at, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : state === 'current'
                              ? t('merchant.rental.timeline.inProgress')
                              : t('merchant.rental.timeline.pending')}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </section>

          {/* Activity log preview */}
          <section>
            <SectionHeader
              title={t('merchant.rental.activity.title')}
              action={
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-400">
                  <HistoryIcon size={14} />
                  {t('merchant.rental.activity.count', {
                    count: rental.timeline.length,
                  })}
                </span>
              }
            />
            <Card padded className="space-y-3">
              {activityPreview.map((e, i) => (
                <div key={`${e.key}-${e.at}`}>
                  {i > 0 && <CardDivider />}
                  <ActivityRow
                    event={e}
                    formatDate={formatDate}
                    label={t(`merchant.rental.events.${e.key}`)}
                  />
                </div>
              ))}
            </Card>
          </section>

          {/* Actions */}
          <div className="space-y-2.5 pt-1">
            {closureState === 'active' && (
              <>
                <Button
                  size="lg"
                  block
                  leading={<CheckIcon size={16} />}
                  onClick={() => navigate(`/merchant/rentals/${rental.id}/close`)}
                >
                  {t('merchant.rental.actions.close')}
                </Button>
                <Button
                  variant="secondary"
                  block
                  leading={<AlertIcon size={16} />}
                  onClick={() =>
                    navigate(`/merchant/rentals/${rental.id}/damage/new`)
                  }
                >
                  {t('merchant.rental.actions.reportDamage')}
                </Button>
              </>
            )}
            {closureState === 'damaged' && rental.damageCaseId && (
              <Button
                size="lg"
                block
                leading={<PackageIcon size={16} />}
                onClick={() =>
                  navigate(`/merchant/damages/${rental.damageCaseId}`)
                }
              >
                {t('merchant.rental.actions.openDamageCase')}
              </Button>
            )}
            <Button
              variant={closureState === 'active' ? 'ghost' : 'secondary'}
              block
              leading={<DocIcon size={16} />}
              onClick={() => navigate(`/merchant/rentals/${rental.id}/contract`)}
            >
              {t('merchant.rental.actions.openContract')}
            </Button>
            <Button
              variant="ghost"
              block
              leading={<SignatureIcon size={16} />}
              onClick={() => navigate(`/merchant/rentals/${rental.id}/note`)}
            >
              {t('merchant.rental.actions.openNote')}
            </Button>
          </div>

          <div className="rounded-xl2 bg-gold-50 hairline p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-gold-700 grid place-items-center ring-1 hairline">
              <ShieldIcon size={18} />
            </span>
            <div className="min-w-0 text-[12px] text-brand-800/90 leading-relaxed">
              <div className="flex items-center gap-1.5 text-brand-900 font-semibold mb-0.5">
                <InfoIcon size={12} />
                {t('track.placeholders.nafith')}
              </div>
              {t('track.placeholders.nafithDesc')}
            </div>
          </div>
        </div>
      </Screen>
    </>
  );
}

function HeroStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div>
      <div className="text-white/55 uppercase tracking-wide text-[10.5px]">
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-white num truncate">{value}</div>
    </div>
  );
}

function DocRow({
  icon,
  tone,
  label,
  refValue,
  state,
  to,
  dir,
}: {
  icon: ReactNode;
  tone: string;
  label: ReactNode;
  refValue: string;
  state: MerchantRentalDocState;
  to: string;
  dir: 'rtl' | 'ltr';
}) {
  const t = useT();
  return (
    <Link
      to={to}
      className="flex items-center gap-3 w-full text-start group"
    >
      <span className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {label}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-400 num truncate">
          {refValue}
        </div>
      </div>
      <StatusChip
        tone={toneForDocState(state)}
        dot
        label={t(`merchant.rental.docs.state.${state}`)}
      />
      <ChevronIcon
        size={14}
        className={cn(
          'text-ink-300 group-hover:text-ink-500 transition-colors',
          dir === 'rtl' ? '' : 'rotate-180',
        )}
      />
    </Link>
  );
}

function NafithRow({
  stepLabel,
  stepSub,
  state,
  at,
  formatDate,
  t,
}: {
  stepLabel: ReactNode;
  stepSub: ReactNode;
  state: StageState;
  at: string | undefined;
  formatDate: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'h-9 w-9 shrink-0 rounded-xl grid place-items-center',
          state === 'done'
            ? 'bg-success-50 text-success-600'
            : state === 'current'
              ? 'bg-canvas-100 text-ink-700'
              : 'bg-canvas-100 text-ink-400',
        )}
      >
        {state === 'done' ? (
          <BadgeCheckIcon size={16} />
        ) : state === 'current' ? (
          <SparkleIcon size={16} />
        ) : (
          <ClockIcon size={16} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[13.5px] font-semibold text-ink-900 truncate">
            {stepLabel}
          </div>
          <StatusChip
            size="sm"
            tone={state === 'done' ? 'success' : state === 'current' ? 'brand' : 'neutral'}
            dot
            label={t(
              state === 'done'
                ? 'merchant.rental.nafith.state.done'
                : state === 'current'
                  ? 'merchant.rental.nafith.state.current'
                  : 'merchant.rental.nafith.state.pending',
            )}
          />
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-400 leading-relaxed">
          {stepSub}
        </div>
        {state === 'done' && at && (
          <div className="mt-1 text-[11.5px] text-ink-500 num">
            {formatDate(at, { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({
  event,
  formatDate,
  label,
}: {
  event: MerchantRentalTimelineEvent;
  formatDate: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  label: ReactNode;
}) {
  const { icon, tone } = eventVisual(event.key);
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'h-9 w-9 shrink-0 rounded-xl grid place-items-center',
          tone,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink-900 truncate">
          {label}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-400 num">
          {formatDate(event.at, { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
}

function stageIcon(key: StageKey) {
  switch (key) {
    case 'created':
      return <ReceiptIcon size={14} />;
    case 'customer-approved':
      return <UsersIcon size={14} />;
    case 'documents-ready':
      return <DocIcon size={14} />;
    case 'nafith-submitted':
      return <GavelIcon size={14} />;
    case 'nafith-approved':
      return <BadgeCheckIcon size={14} />;
    case 'activated':
      return <SparkleIcon size={14} />;
  }
}

function eventVisual(key: MerchantRentalTimelineKey): {
  icon: ReactNode;
  tone: string;
} {
  switch (key) {
    case 'created':
      return { icon: <ReceiptIcon size={14} />, tone: 'bg-canvas-100 text-ink-600' };
    case 'customer-approved':
      return { icon: <UsersIcon size={14} />, tone: 'bg-canvas-100 text-ink-700' };
    case 'contract-ready':
      return { icon: <DocIcon size={14} />, tone: 'bg-canvas-100 text-ink-700' };
    case 'note-ready':
      return { icon: <SignatureIcon size={14} />, tone: 'bg-gold-50 text-gold-700' };
    case 'nafith-submitted':
      return { icon: <GavelIcon size={14} />, tone: 'bg-gold-50 text-gold-700' };
    case 'nafith-approved':
      return {
        icon: <BadgeCheckIcon size={14} />,
        tone: 'bg-success-50 text-success-600',
      };
    case 'activated':
      return {
        icon: <SparkleIcon size={14} />,
        tone: 'bg-success-50 text-success-600',
      };
    case 'payment-received':
      return {
        icon: <BadgeCheckIcon size={14} />,
        tone: 'bg-success-50 text-success-600',
      };
    case 'due-reminder':
      return { icon: <ClockIcon size={14} />, tone: 'bg-warn-50 text-warn-600' };
    case 'returned':
      return { icon: <CheckIcon size={14} />, tone: 'bg-canvas-200 text-ink-600' };
  }
}

// re-exported for other rental-related pages
export { toneForStatus as rentalStatusTone, toneForDocState, toneForNafith };
