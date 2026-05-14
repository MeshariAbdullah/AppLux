import type { ReactNode } from 'react';
import { CheckIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import type { JourneyStep, RentalStage, StageStatus } from '@/lib/rentalJourney';

type RentalJourneyTimelineProps = {
  steps: JourneyStep[];
  /** Show an eyebrow header above the list ("Rental Journey · Step N of 7"). */
  showHeader?: boolean;
  /** Show timestamps on completed steps when available. Default: true. */
  showTimestamps?: boolean;
  className?: string;
};

/**
 * The Rental Journey Timeline — the canonical 7-stage progression shown
 * across Review, Approval, all tracking screens, and merchant rental
 * details. Visually calm and premium: single lavender accent, completed
 * dots with a check, the current stage marked with a soft halo, pending
 * stages as quiet outlines on a thin connector.
 *
 * Always renders 7 rows in the canonical order so the rhythm stays the
 * same regardless of how far along the rental is.
 */
export function RentalJourneyTimeline({
  steps,
  showHeader = true,
  showTimestamps = true,
  className,
}: RentalJourneyTimelineProps) {
  const t = useT();
  const { formatDate } = useI18n();

  const activeIndex = steps.findIndex((s) => s.status === 'active');
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const headlineIndex = activeIndex >= 0 ? activeIndex : completedCount - 1;
  const headlineStage = headlineIndex >= 0 ? steps[headlineIndex]?.stage : null;
  const stepNumber = headlineIndex >= 0 ? headlineIndex + 1 : 1;

  return (
    <section
      className={cn(
        'rounded-xl3 bg-white hairline shadow-soft p-5',
        className,
      )}
      aria-label={t('journey.title')}
    >
      {showHeader && (
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-semibold text-lavender-600 uppercase tracking-[0.12em]">
              {t('journey.title')}
            </div>
            {headlineStage && (
              <div className="mt-1 editorial-title text-[15px] text-ink-900 leading-tight">
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
          const nextIsReached =
            !isLast && (steps[i + 1].status !== 'pending');
          return (
            <li key={step.stage} className="flex items-start gap-3.5">
              <div className="flex flex-col items-center">
                <StageDot status={step.status} />
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      'w-px flex-1 my-1 min-h-7 transition-colors',
                      step.status === 'completed' && nextIsReached
                        ? 'bg-lavender-300'
                        : step.status === 'completed'
                          ? 'bg-lavender-200'
                          : 'bg-canvas-200',
                    )}
                  />
                )}
              </div>
              <div className={cn('flex-1 min-w-0', !isLast && 'pb-4')}>
                <div className="flex items-baseline justify-between gap-3">
                  <StageLabel stage={step.stage} status={step.status} />
                  {showTimestamps && step.at && step.status === 'completed' && (
                    <span className="shrink-0 text-[11px] text-ink-400 num">
                      {formatDate(step.at, { dateStyle: 'medium' })}
                    </span>
                  )}
                  {step.status === 'active' && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-semibold text-lavender-700 bg-lavender-50 rounded-full px-2 py-0.5">
                      {t('journey.status.active')}
                    </span>
                  )}
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
