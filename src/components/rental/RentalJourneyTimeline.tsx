import type { ReactNode } from 'react';
import { BadgeCheckIcon, CheckIcon, ShieldIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import type {
  JourneyStep,
  RentalStage,
  StageBadge,
  StageStatus,
} from '@/lib/rentalJourney';

type RentalJourneyTimelineProps = {
  steps: JourneyStep[];
  /** Show an eyebrow header above the list. Default true. */
  showHeader?: boolean;
  /** Show completed timestamps. Default true. */
  showTimestamps?: boolean;
  /** Visual variant. 'lead' = full presence (page-leading); 'card' = condensed. */
  variant?: 'lead' | 'card';
  className?: string;
};

/**
 * The Rental Journey Timeline — the canonical 7-stage progression shown
 * across Review, Approval, all tracking screens, and merchant rental
 * details. Visually calm and premium: single lavender accent, completed
 * dots with a check, the current stage marked with a soft halo, pending
 * stages as quiet outlines on a thin connector.
 *
 * Documentation seals (badges) render on completed stages whose underlying
 * state is provable (signed_at, ended_at, etc.) — so the timeline reads as
 * a system of record, not a progress bar.
 *
 * Always renders 7 rows in the canonical order so the rhythm stays the
 * same regardless of how far along the rental is.
 */
export function RentalJourneyTimeline({
  steps,
  showHeader = true,
  showTimestamps = true,
  variant = 'card',
  className,
}: RentalJourneyTimelineProps) {
  const t = useT();
  const { formatDate } = useI18n();

  const activeIndex = steps.findIndex((s) => s.status === 'active');
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const headlineIndex = activeIndex >= 0 ? activeIndex : completedCount - 1;
  const headlineStage = headlineIndex >= 0 ? steps[headlineIndex]?.stage : null;
  const stepNumber = headlineIndex >= 0 ? headlineIndex + 1 : 1;
  const isLead = variant === 'lead';

  return (
    <section
      className={cn(
        'rounded-xl3 bg-white hairline shadow-soft',
        isLead ? 'p-6' : 'p-5',
        className,
      )}
      aria-label={t('journey.title')}
    >
      {showHeader && (
        <header className={cn('flex items-baseline justify-between gap-3', isLead ? 'mb-5' : 'mb-4')}>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold text-lavender-600 uppercase tracking-[0.14em]">
              {t('journey.title')}
            </div>
            {headlineStage && (
              <div
                className={cn(
                  'mt-1.5 editorial-title text-ink-900 leading-tight',
                  isLead ? 'text-[18px]' : 'text-[15px]',
                )}
              >
                {t(`journey.stages.${headlineStage}`)}
              </div>
            )}
          </div>
          <div className="shrink-0 text-[11px] text-ink-400 num">
            {t('journey.step', { current: stepNumber, total: steps.length })}
          </div>
        </header>
      )}

      <ol className="relative">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const nextIsReached = !isLast && steps[i + 1].status !== 'pending';
          return (
            <li key={step.stage} className="flex items-start gap-3.5">
              <div className="flex flex-col items-center">
                <StageDot status={step.status} />
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      'w-px flex-1 my-1 transition-colors',
                      isLead ? 'min-h-9' : 'min-h-7',
                      step.status === 'completed' && nextIsReached
                        ? 'bg-lavender-300'
                        : step.status === 'completed'
                          ? 'bg-lavender-200'
                          : 'bg-canvas-200',
                    )}
                  />
                )}
              </div>
              <div className={cn('flex-1 min-w-0', !isLast && (isLead ? 'pb-5' : 'pb-4'))}>
                <div className="flex items-start justify-between gap-3">
                  <StageLabel stage={step.stage} status={step.status} />
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {step.status === 'active' && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-lavender-700 bg-lavender-50 rounded-full px-2 py-0.5">
                        {t('journey.status.active')}
                      </span>
                    )}
                    {showTimestamps && step.at && step.status === 'completed' && (
                      <span className="text-[11px] text-ink-400 num">
                        {formatDate(step.at, { dateStyle: 'medium' })}
                      </span>
                    )}
                    {step.badge && step.status === 'completed' && (
                      <DocumentedStamp badge={step.badge} />
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StageDot({ status }: { status: StageStatus }) {
  if (status === 'completed') {
    return (
      <span
        className="h-7 w-7 rounded-full bg-lavender-400 grid place-items-center text-white ring-2 ring-lavender-100"
        aria-hidden
      >
        <CheckIcon size={13} strokeWidth={3} />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span
        className="relative h-7 w-7 rounded-full bg-white grid place-items-center ring-2 ring-lavender-400 shadow-[0_0_0_4px_rgba(164,141,218,0.18)]"
        aria-hidden
      >
        <span className="h-2.5 w-2.5 rounded-full bg-lavender-400" />
      </span>
    );
  }
  return (
    <span
      className="h-7 w-7 rounded-full bg-white ring-2 ring-canvas-200 grid place-items-center"
      aria-hidden
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />
    </span>
  );
}

function StageLabel({
  stage,
  status,
}: {
  stage: RentalStage;
  status: StageStatus;
}): ReactNode {
  const t = useT();
  return (
    <div className="min-w-0">
      <div
        className={cn(
          'text-[13.5px] font-semibold tracking-tight truncate',
          status === 'pending' ? 'text-ink-400' : 'text-ink-900',
        )}
      >
        {t(`journey.stages.${stage}`)}
      </div>
      <div
        className={cn(
          'mt-0.5 text-[11.5px] leading-relaxed',
          status === 'pending' ? 'text-ink-300' : 'text-ink-500',
        )}
      >
        {t(`journey.descriptions.${stage}`)}
      </div>
    </div>
  );
}

/**
 * The "Documented" layer — a quiet seal next to a completed stage telling
 * the user that the step is officially recorded. Lavender border, subtle
 * shield icon, no shadow. Reads as a stamp on paper, not a notification.
 */
function DocumentedStamp({ badge }: { badge: StageBadge }) {
  const t = useT();
  const icon =
    badge === 'signed' || badge === 'attested' ? (
      <BadgeCheckIcon size={10} />
    ) : (
      <ShieldIcon size={10} />
    );
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-lavender-50 ring-1 ring-inset ring-lavender-200 rounded-full px-1.5 py-0.5 animate-stamp-in"
      title={t(`journey.badges.${badge}.hint`)}
    >
      {icon}
      {t(`journey.badges.${badge}.label`)}
    </span>
  );
}
