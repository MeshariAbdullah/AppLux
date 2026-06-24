import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  EmptyState,
  ImageLightbox,
  SectionHeader,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CameraIcon,
  CarIcon,
  ChevronIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  ImageIcon,
  InfoIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
  SignatureIcon,
  SparkleIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';
import type {
  MerchantDamageCase,
  MerchantDamageSeverity,
  MerchantDamageStatus,
} from '@/lib/data';

type StepKey = 'review' | 'settlement' | 'nafith' | 'execution';
type StepState = 'done' | 'current' | 'pending';

const STEP_ORDER: StepKey[] = ['review', 'settlement', 'nafith', 'execution'];

function toneForStatus(s: MerchantDamageStatus): StatusTone {
  if (s === 'settled') return 'success';
  if (s === 'investigating') return 'warn';
  return 'danger';
}

function toneForSeverity(s: MerchantDamageSeverity): StatusTone {
  if (s === 'partial') return 'warn';
  return 'danger';
}

function computeSteps(c: MerchantDamageCase): Record<StepKey, StepState> {
  const out: Record<StepKey, StepState> = {
    review: 'pending',
    settlement: 'pending',
    nafith: 'pending',
    execution: 'pending',
  };
  if (c.status === 'reported') {
    out.review = 'current';
  } else if (c.status === 'investigating') {
    out.review = 'done';
    if (c.severity === 'partial') {
      out.settlement = 'current';
    } else {
      out.settlement = 'done';
      out.nafith = 'current';
    }
  } else {
    // settled
    out.review = 'done';
    out.settlement = 'done';
    if (c.severity !== 'partial') {
      out.nafith = 'done';
      out.execution = 'done';
    }
  }
  return out;
}

function stepIcon(key: StepKey): ReactNode {
  switch (key) {
    case 'review':
      return <ShieldIcon size={14} />;
    case 'settlement':
      return <GavelIcon size={14} />;
    case 'nafith':
      return <DocIcon size={14} />;
    case 'execution':
      return <SparkleIcon size={14} />;
  }
}

export default function MerchantDamageDetails() {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantDamages, merchantRentals } = useStore();
  const { configured } = useSupabaseAuth();

  const kase = useMemo(
    () => merchantDamages.find((d) => d.id === id),
    [id, merchantDamages],
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Phase 9: this page reads from the demo store today. In live mode
  // the store returns an empty array, so a direct visit to a damage-case
  // URL has no row to render. Until a Supabase fetch is wired, surface
  // an explicit empty state instead of bouncing back to the list (which
  // is what the old `<Navigate />` did — and looks like a 404 to the
  // user).
  if (!kase) {
    if (configured) {
      return (
        <>
          <Header title={t('merchant.damageCase.eyebrow')} showBack />
          <Screen className="bg-canvas">
            <EmptyState
              tone="warn"
              icon={<AlertIcon size={22} />}
              title={t('merchant.damageCase.notFound.title')}
              description={t('merchant.damageCase.notFound.body')}
              action={
                <Button
                  size="sm"
                  onClick={() => navigate('/merchant/damages', { replace: true })}
                >
                  {t('merchant.damageCase.notFound.back')}
                </Button>
              }
            />
          </Screen>
        </>
      );
    }
    return <Navigate to="/merchant/damages" replace />;
  }

  const rental = merchantRentals.find((r) => r.id === kase.rentalId);
  const steps = computeSteps(kase);
  const currentStep =
    STEP_ORDER.find((k) => steps[k] === 'current') ?? 'execution';
  const statusTone = toneForStatus(kase.status);
  const sevTone = toneForSeverity(kase.severity);
  const contractRef = kase.contractRef ?? rental?.contractRef;
  const noteRef = kase.noteRef ?? rental?.noteRef;
  const invoiceRef =
    kase.invoiceRef ??
    (rental ? `INV-${rental.contractRef.replace('CN-', '')}-LATEST` : undefined);

  return (
    <>
      <Header title={kase.id} subtitle={kase.customerName} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-danger-500/25 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span
                className={cn(
                  'h-11 w-11 shrink-0 rounded-2xl ring-1 grid place-items-center',
                  kase.severity === 'partial'
                    ? 'bg-warn-500/20 ring-warn-400/30 text-warn-200'
                    : 'bg-danger-500/20 ring-danger-400/30 text-danger-200',
                )}
              >
                {kase.severity === 'non-return' ? (
                  <PackageIcon size={20} />
                ) : kase.severity === 'total' ? (
                  <AlertIcon size={20} />
                ) : (
                  <GavelIcon size={20} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] text-white/55 uppercase tracking-[0.08em]">
                  {t('merchant.damageCase.eyebrow')}
                </div>
                <div className="mt-1.5 editorial-title text-[20px] truncate num text-white">
                  {kase.id}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusChip
                    tone={sevTone}
                    dot={false}
                    label={t(`merchant.damages.severity.${kase.severity}`)}
                  />
                  <StatusChip
                    tone={statusTone}
                    dot
                    label={t(`merchant.damages.status.${kase.status}`)}
                  />
                </div>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[11.5px]">
              <HeroStat
                label={t('merchant.damageCase.claim')}
                value={formatCurrency(kase.claimAmount)}
              />
              <HeroStat
                label={t('merchant.damageCase.reportedAt')}
                value={formatDate(kase.reportedAt, { dateStyle: 'medium' })}
              />
            </div>
          </div>

          {/* Linked rental */}
          {rental && (
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damageCase.linkedRental')}
                className="mb-0"
              />
              <Link
                to={`/merchant/rentals/${rental.id}`}
                className="flex items-center gap-3 w-full group"
              >
                <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                  <CarIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                    {rental.item}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
                    <UsersIcon size={11} />
                    <span className="truncate">{rental.customerName}</span>
                    <span className="text-ink-300">·</span>
                    <span className="num">{rental.id}</span>
                  </div>
                </div>
                <ChevronIcon
                  size={14}
                  className={cn(
                    'text-ink-300 group-hover:text-ink-500 transition-colors',
                    dir === 'rtl' ? '' : 'rotate-180',
                  )}
                />
              </Link>
            </Card>
          )}

          {/* Linked docs */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.damageCase.documents')}
              className="mb-0"
            />
            {contractRef && (
              <>
                <DocLinkRow
                  icon={<DocIcon size={16} />}
                  tone="bg-canvas-100 text-ink-700"
                  label={t('merchant.rental.docs.contract')}
                  refValue={contractRef}
                  to={
                    rental ? `/merchant/rentals/${rental.id}/contract` : undefined
                  }
                  dir={dir}
                />
                <CardDivider />
              </>
            )}
            {noteRef && (
              <>
                <DocLinkRow
                  icon={<SignatureIcon size={16} />}
                  tone="bg-gold-50 text-gold-700"
                  label={t('merchant.rental.docs.note')}
                  refValue={noteRef}
                  to={rental ? `/merchant/rentals/${rental.id}/note` : undefined}
                  dir={dir}
                />
                <CardDivider />
              </>
            )}
            {invoiceRef && (
              <DocLinkRow
                icon={<ReceiptIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
                label={t('merchant.damageCase.invoice')}
                refValue={invoiceRef}
                dir={dir}
              />
            )}
          </Card>

          {/* Case file: evidence + notes grouped */}
          <Card padded className="space-y-4">
              <SectionHeader
                title={t('merchant.damageCase.caseFile')}
                className="mb-0"
              />

              {/* Evidence */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-700">
                    <CameraIcon size={14} />
                    {t('merchant.damageCase.evidence')}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-semibold num rounded-full px-2 py-0.5',
                      kase.evidence && kase.evidence.length > 0
                        ? 'bg-success-50 text-success-700'
                        : 'bg-canvas-200 text-ink-500',
                    )}
                  >
                    {kase.evidence?.length ?? 0}
                  </span>
                </div>

                {kase.evidence && kase.evidence.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {kase.evidence.map((src, i) => (
                      <button
                        key={`${i}-${src.length}`}
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        className="relative aspect-square overflow-hidden rounded-xl bg-canvas-200 hairline active:scale-[0.98] transition-transform"
                      >
                        <img
                          src={src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute top-1 start-1 num text-[10px] font-bold bg-black/65 text-white rounded-md px-1.5 py-0.5">
                          {i + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl2 bg-canvas-100 hairline p-4 flex items-center gap-3 text-[12px] text-ink-500">
                    <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-ink-400 grid place-items-center hairline">
                      <ImageIcon size={16} />
                    </span>
                    <div className="leading-relaxed">
                      <div className="text-[12.5px] font-semibold text-ink-700">
                        {t('merchant.damageCase.noEvidence.title')}
                      </div>
                      <div>{t('merchant.damageCase.noEvidence.hint')}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-700">
                  <DocIcon size={14} />
                  {t('merchant.damageCase.notes')}
                </div>
                {kase.notes ? (
                  <div className="rounded-xl2 bg-canvas-100 hairline px-4 py-3 text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                    {kase.notes}
                  </div>
                ) : (
                  <div className="rounded-xl2 bg-canvas-100 hairline p-3 text-[12px] text-ink-500 leading-relaxed">
                    {t('merchant.damageCase.noNotes')}
                  </div>
                )}
              </div>
            </Card>

          {/* Escalation next step */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.damageCase.nextStep.title')}
              className="mb-0"
            />
            <div
              className={cn(
                'rounded-xl2 p-3.5 flex items-start gap-3 ring-1',
                kase.status === 'settled'
                  ? 'bg-success-50 ring-success-500/20'
                  : 'bg-gold-50 hairline',
              )}
            >
              <span
                className={cn(
                  'h-10 w-10 shrink-0 rounded-xl grid place-items-center ring-1',
                  kase.status === 'settled'
                    ? 'bg-white text-success-600 ring-success-500/20'
                    : 'bg-white text-gold-700 hairline',
                )}
              >
                {kase.status === 'settled' ? (
                  <BadgeCheckIcon size={18} />
                ) : (
                  stepIcon(currentStep)
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'text-[13.5px] font-semibold',
                    kase.status === 'settled' ? 'text-success-700' : 'text-brand-900',
                  )}
                >
                  {t(
                    kase.status === 'settled'
                      ? 'merchant.damageCase.nextStep.settled'
                      : `merchant.damageCase.nextStep.steps.${currentStep}`,
                  )}
                </div>
                <div
                  className={cn(
                    'mt-0.5 text-[12px] leading-relaxed',
                    kase.status === 'settled' ? 'text-success-700/80' : 'text-brand-800/90',
                  )}
                >
                  {t(
                    kase.status === 'settled'
                      ? 'merchant.damageCase.nextStep.settledSub'
                      : `merchant.damageCase.nextStep.stepsSub.${currentStep}`,
                  )}
                </div>
              </div>
            </div>

            {/* Step track */}
            <ol className="relative pt-1">
              {STEP_ORDER.map((key, i) => {
                const state = steps[key];
                const isLast = i === STEP_ORDER.length - 1;
                return (
                  <li key={key} className="flex items-start gap-3 relative">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'h-7 w-7 rounded-full grid place-items-center shrink-0 ring-2',
                          state === 'done'
                            ? 'bg-success-500 text-white ring-success-500/25'
                            : state === 'current'
                              ? 'bg-gold-400 text-ink-950 ring-gold-100'
                              : 'bg-canvas-200 text-ink-400 hairline',
                        )}
                      >
                        {state === 'done' ? (
                          <BadgeCheckIcon size={12} />
                        ) : (
                          stepIcon(key)
                        )}
                      </span>
                      {!isLast && (
                        <span
                          className={cn(
                            'w-px flex-1 my-1 min-h-5',
                            state === 'done' ? 'bg-success-500/30' : 'bg-ink-100',
                          )}
                        />
                      )}
                    </div>
                    <div className={cn('flex-1 min-w-0', !isLast && 'pb-4')}>
                      <div
                        className={cn(
                          'text-[12.5px] font-semibold',
                          state === 'pending' ? 'text-ink-500' : 'text-ink-900',
                        )}
                      >
                        {t(`merchant.damageCase.nextStep.steps.${key}`)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-400">
                        {t(
                          state === 'done'
                            ? 'merchant.damageCase.nextStep.state.done'
                            : state === 'current'
                              ? 'merchant.damageCase.nextStep.state.current'
                              : 'merchant.damageCase.nextStep.state.pending',
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          {/* Outcome timeline */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.damageCase.timeline.title')}
              className="mb-0"
            />
            <ol className="relative">
              <TimelineRow
                tone="bg-danger-50 text-danger-600"
                icon={<AlertIcon size={14} />}
                label={t('merchant.damageCase.timeline.reported')}
                at={formatDate(kase.reportedAt, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                done
              />
              <TimelineRow
                tone={
                  kase.status !== 'reported'
                    ? 'bg-warn-50 text-warn-600'
                    : 'bg-canvas-100 text-ink-400'
                }
                icon={<ShieldIcon size={14} />}
                label={t('merchant.damageCase.timeline.investigating')}
                at={
                  kase.status !== 'reported'
                    ? t('merchant.damageCase.timeline.inProgress')
                    : t('merchant.damageCase.timeline.pending')
                }
                done={kase.status !== 'reported'}
              />
              <TimelineRow
                tone={
                  kase.status === 'settled'
                    ? 'bg-success-50 text-success-600'
                    : 'bg-canvas-100 text-ink-400'
                }
                icon={<BadgeCheckIcon size={14} />}
                label={t('merchant.damageCase.timeline.settled')}
                at={
                  kase.status === 'settled'
                    ? t('merchant.damageCase.timeline.done')
                    : t('merchant.damageCase.timeline.pending')
                }
                done={kase.status === 'settled'}
                last
              />
            </ol>
          </Card>

          <div className="rounded-xl2 bg-canvas-100 hairline p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-ink-700 grid place-items-center hairline">
              <InfoIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12px] text-ink-600 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-0.5">
                {t('merchant.damageCase.placeholder.title')}
              </div>
              <div>{t('merchant.damageCase.placeholder.hint')}</div>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {rental && (
              <Button
                variant="secondary"
                block
                leading={<CarIcon size={16} />}
                onClick={() => navigate(`/merchant/rentals/${rental.id}`)}
              >
                {t('merchant.damageCase.actions.openRental')}
              </Button>
            )}
            <Button
              variant="ghost"
              block
              leading={<ClockIcon size={16} />}
              onClick={() => navigate('/merchant/damages')}
            >
              {t('merchant.damageCase.actions.backToList')}
            </Button>
          </div>
        </div>
      </Screen>

      <ImageLightbox
        open={lightboxIndex !== null}
        images={kase.evidence ?? []}
        startIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        caption={(i, total) =>
          `${t('merchant.damageCase.evidence')} · ${i + 1} / ${total}`
        }
      />
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

function DocLinkRow({
  icon,
  tone,
  label,
  refValue,
  to,
  dir,
}: {
  icon: ReactNode;
  tone: string;
  label: ReactNode;
  refValue: string;
  to?: string;
  dir: 'rtl' | 'ltr';
}) {
  const body = (
    <>
      <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink-900 truncate">
          {label}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-400 num truncate">
          {refValue}
        </div>
      </div>
      {to && (
        <ChevronIcon
          size={14}
          className={cn(
            'text-ink-300',
            dir === 'rtl' ? '' : 'rotate-180',
          )}
        />
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="flex items-center gap-3 w-full group">
        {body}
      </Link>
    );
  }
  return <div className="flex items-center gap-3">{body}</div>;
}

function TimelineRow({
  tone,
  icon,
  label,
  at,
  done,
  last,
}: {
  tone: string;
  icon: ReactNode;
  label: ReactNode;
  at: ReactNode;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 relative">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'h-8 w-8 rounded-full grid place-items-center shrink-0 ring-2 ring-inset',
            tone,
            done ? '' : 'opacity-70',
          )}
        >
          {icon}
        </span>
        {!last && (
          <span
            className={cn(
              'w-px flex-1 my-1 min-h-5',
              done ? 'bg-success-500/30' : 'bg-ink-100',
            )}
          />
        )}
      </div>
      <div className={cn('flex-1 min-w-0', !last && 'pb-4')}>
        <div
          className={cn(
            'text-[13px] font-semibold',
            done ? 'text-ink-900' : 'text-ink-500',
          )}
        >
          {label}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-400 num">{at}</div>
      </div>
    </li>
  );
}
