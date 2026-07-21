import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, EmptyState, SectionHeader, StatusChip, type StatusTone } from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  HistoryIcon,
  InfoIcon,
  PackageIcon,
  ReceiptIcon,
  SignatureIcon,
  SparkleIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { cachedFetch } from '@/lib/cache/memoryCache';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { getInitials } from '@/lib/format/initials';
import { isRentalFinalized } from '@/lib/format/rentalFinalization';
import { rentalStatusTone as toneForStatus } from '@/lib/format/statusTones';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  listInvoiceItems,
  fetchContractById,
  fetchMerchant,
  fetchNoteByContractId,
  fetchProfile,
  useSupabaseAuth,
} from '@/lib/supabase';
import type {
  MerchantNafithState,
  MerchantRental,
  MerchantRentalDocState,
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
  // Initialise `resolving` lazily based on whether the effect below
  // is actually going to run a fetch. Critical fix: the previous
  // `useState(false)` caused the first render to satisfy the
  // !rental && !resolving branch and synchronously emit
  // <Navigate to="/merchant/rentals" replace />, bouncing the
  // merchant back to the list before useEffect could even fire. By
  // starting in the "resolving" state for live ids, the page renders
  // a loading placeholder until the fetch resolves.
  const [resolving, setResolving] = useState<boolean>(() =>
    Boolean(configured && id && !demoRental),
  );

  useEffect(() => {
    if (!configured || !id || demoRental) {
      setLiveRental(null);
      return;
    }
    let cancelled = false;
    // Clear the previous entity's data before the new fetch starts so
    // the page never renders rental A while the user is navigating to
    // rental B (Phase 9 follow-up — entity leak fix).
    setLiveRental(null);
    setResolving(true);
    (async () => {
      // Phase 4A: contract / merchant / note read through the memory
      // cache (1-min bundle TTL; merchant reuses the 15-min entity
      // key), so hopping Details ↔ Close ↔ Damage within the TTL is
      // instant. Close/damage mutations invalidate these keys. The
      // customer profile stays LIVE — full row includes national_id.
      const contract = await cachedFetch(
        cacheKeys.contract(id),
        CACHE_TTL.rentalBundle,
        () => fetchContractById(id),
      ).catch(() => null);
      if (cancelled) return;
      if (!contract) {
        // No row (or RLS denied). Leave liveRental=null; the render
        // path below shows a clear "couldn't load" empty state with
        // a back action once `resolving` flips to false in finally.
        return;
      }
      const [merchant, customer, note] = await Promise.all([
        cachedFetch(
          cacheKeys.merchantEntity(contract.merchant_id),
          CACHE_TTL.merchantEntity,
          () => fetchMerchant(contract.merchant_id),
        ).catch(() => null),
        fetchProfile(contract.customer_user_id).catch(() => null),
        // Linked promissory note — drives noteState, nafithState, and
        // the activity timeline. Without it the Nafath section was
        // stuck on "pending" even after the rental was fully verified.
        cachedFetch(
          cacheKeys.noteByContract(contract.id),
          CACHE_TTL.rentalBundle,
          () => fetchNoteByContractId(contract.id),
        ).catch(() => null),
      ]);
      if (cancelled) return;
      const customerName = customer?.full_name ?? '—';
      // Data-consistency fix: the headline is the REAL invoice item
      // name (same source the customer sees), not a fabricated label.
      const items = await cachedFetch<Awaited<ReturnType<typeof listInvoiceItems>>>(
        cacheKeys.invoiceItems(contract.invoice_id),
        CACHE_TTL.rentalBundle,
        () => listInvoiceItems(contract.invoice_id),
      ).catch(() => []);
      if (cancelled) return;
      setLiveRental(
        adaptContractToMerchantRental(contract, {
          customerName,
          customerInitials: getInitials(customerName),
          customerCity: customer?.city ?? '',
          customerMobile: customer?.mobile ?? '',
          headlineItem: items[0]?.item_name ?? contract.contract_number,
          category: merchant?.primary_category,
          note,
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
    if (resolving) {
      // Still fetching — render a quiet placeholder rather than
      // bouncing back to the list. Header keeps the user oriented.
      return (
        <>
          <Header title="…" showBack />
          <Screen className="bg-canvas">
            <div className="min-h-[40vh] grid place-items-center">
              <span className="h-7 w-7 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
            </div>
          </Screen>
        </>
      );
    }
    // Fetch finished and produced nothing (deleted row, RLS denied,
    // network failure). Surface this explicitly with a back action
    // instead of silently redirecting.
    return (
      <>
        <Header title={t('merchant.rentals.title')} showBack />
        <Screen className="bg-canvas">
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('merchant.rental.notFound.title')}
            description={t('merchant.rental.notFound.hint')}
            action={
              <Button
                size="sm"
                onClick={() => navigate('/merchant/rentals', { replace: true })}
              >
                {t('merchant.rental.notFound.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const statusTone = toneForStatus(rental.status);
  // Belt-and-suspenders: prefer the explicit closureStatus (populated
  // by the adapter for status='ended'/'cancelled' and by the demo
  // store's reportDamage). Fall back to isRentalFinalized so any
  // 'returned' status without closureStatus also lands here.
  const closureState: 'active' | 'closed' | 'damaged' =
    rental.closureStatus === 'damaged'
      ? 'damaged'
      : rental.closureStatus === 'closed' || isRentalFinalized(rental)
        ? 'closed'
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

  // Design M13 — position on the approved four-stage journey. A
  // finalized contract has completed all four stages; an active one is
  // in stage 3 (بدء الإيجار); anything pre-approval sits in stage 2.
  const journeyIdx =
    closureState !== 'active' ? 4 : rental.customerApproved ? 2 : 1;

  return (
    <>
      <Header
        title={rental.contractRef}
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
          {/* M13 journey card — the shared four-stage reference journey
              rendered as a horizontal stepper. */}
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-4 py-5">
            <div className="flex items-start">
              {(
                [
                  'journey.stages.request',
                  'journey.stages.review',
                  'journey.stages.started',
                  'journey.stages.closure',
                ] as const
              ).map((key, i) => {
                const done = i < journeyIdx;
                const current = i === journeyIdx;
                return (
                  <div key={key} className="contents">
                    {i > 0 && (
                      <div
                        aria-hidden
                        className={cn(
                          'flex-[0.5] h-[2.5px] mt-3',
                          i <= journeyIdx - 1
                            ? 'bg-green-700'
                            : i === journeyIdx
                              ? 'bg-gradient-to-l from-green-700 to-navy-100/60 rtl:bg-gradient-to-r'
                              : 'bg-navy-100/60',
                        )}
                      />
                    )}
                    <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          'h-[26px] w-[26px] rounded-full grid place-items-center text-[11px] font-bold num',
                          done
                            ? 'bg-green-700 text-white'
                            : current
                              ? 'bg-white border-[3px] border-green-500 text-green-700'
                              : 'bg-white border-[1.5px] border-navy-200 text-ink-400',
                        )}
                      >
                        {done ? <CheckIcon size={12} strokeWidth={2.5} /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          'text-[10.5px] text-center leading-snug',
                          current
                            ? 'font-bold text-green-700'
                            : done
                              ? 'font-semibold text-ink-800'
                              : 'text-ink-400',
                        )}
                      >
                        {t(key)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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

          {/* M13 customer card — approved data only (name + mobile
              were already shown here pre-restyle). */}
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 flex items-center gap-3">
            <span className="h-11 w-11 shrink-0 rounded-full bg-navy-50 text-navy-700 grid place-items-center text-[15px] font-bold">
              {rental.customerInitials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-ink-900 truncate">
                {rental.customerName}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-500 num truncate" dir="ltr">
                +966 {rental.customerMobile}
              </div>
            </div>
            <StatusChip
              size="sm"
              tone={rental.customerApproved ? 'success' : 'warn'}
              dot={false}
              label={t(
                rental.customerApproved
                  ? 'merchant.rental.approval.approved'
                  : 'merchant.rental.approval.awaiting',
              )}
            />
          </div>

          {/* M13 rental facts — key/value rows */}
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-2">
            <FactRow label={t('merchant.rental.info.item')} value={rental.item} />
            <FactRow
              label={t('merchant.rentals.rentalFee')}
              value={<span className="num font-bold">{formatCurrency(rental.monthlyAmount)}</span>}
            />
            <FactRow
              label={t('merchant.rental.info.itemValue')}
              value={<span className="num">{formatCurrency(rental.itemValue)}</span>}
            />
            <FactRow
              label={t('merchant.close.fields.start')}
              value={<span className="num">{formatDate(rental.startDate)}</span>}
            />
            <FactRow
              label={t('merchant.rentals.returnDate')}
              value={<span className="num">{formatDate(rental.endDate)}</span>}
            />
            <FactRow
              label={t('merchant.rentals.rentalPeriodLabel')}
              value={t('merchant.rentals.rentalPeriod', { count: rentalDays })}
              last
            />
          </div>

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
            {/* Promissory-note document row — hidden in the current
                phase (ENABLE_PAYMENTS_AND_NOTES); the note page itself
                redirects back here while the flag is off. */}
            {ENABLE_PAYMENTS_AND_NOTES && (
              <>
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
              </>
            )}
          </Card>

          {/* Nafith placeholders — whole card hidden in the current
              phase (ENABLE_PAYMENTS_AND_NOTES). */}
          {ENABLE_PAYMENTS_AND_NOTES && (
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
          )}

          {/* The bespoke status timeline used to live here. It's been
              consolidated into the Rental Journey Timeline at the top of
              the page so the merchant + customer + admin see the same
              canonical 7-stage progression. */}

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
                {/* Design M13: solid NAVY close + red-outlined damage. */}
                <button
                  type="button"
                  onClick={() => navigate(`/merchant/rentals/${rental.id}/close`)}
                  className="flex items-center justify-center gap-2 h-13 w-full rounded-xl2 bg-navy-700 text-white font-bold text-[14.5px] hover:bg-navy-800 transition-colors"
                >
                  <CheckIcon size={16} />
                  {t('merchant.rental.actions.close')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/merchant/rentals/${rental.id}/damage/new`)
                  }
                  className="flex items-center justify-center gap-2 h-12 w-full rounded-xl2 bg-white text-danger-600 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-danger-500/40 hover:bg-danger-50 transition-colors"
                >
                  <AlertIcon size={15} />
                  {t('merchant.rental.actions.reportDamage')}
                </button>
              </>
            )}
            {closureState === 'closed' && (
              <div className="rounded-xl3 bg-canvas-100 ring-1 ring-canvas-200 p-4 flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-2xl bg-white text-ink-700 grid place-items-center hairline">
                  <CheckIcon size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink-900 tracking-tight">
                    {t('merchant.rental.finalizedBanner.title')}
                  </div>
                  <p className="mt-1 text-[12px] text-ink-500 leading-relaxed">
                    {t('merchant.rental.finalizedBanner.hint')}
                  </p>
                </div>
              </div>
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
            {/* "Open contract details" + "Open promissory note" used
                to live here as ghost buttons. They were exact
                duplicates of the rows in the Documents section above,
                so they're removed — the Documents card is now the
                single access point for opening the contract or note. */}
          </div>

        </div>
      </Screen>
    </>
  );
}

function FactRow({
  label,
  value,
  last,
}: {
  label: ReactNode;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2.5',
        !last && 'border-b border-beige-100',
      )}
    >
      <span className="text-[12.5px] text-ink-500 shrink-0">{label}</span>
      <span className="text-[13px] font-semibold text-ink-900 text-end truncate">
        {value}
      </span>
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

// re-exported for other rental-related pages. The "MerchantRentalStatus"
// tone helper lives in @/lib/format/statusTones (rentalStatusTone);
// doc-state + Nafith helpers are unique to this page so they stay here.
export { toneForDocState, toneForNafith };
