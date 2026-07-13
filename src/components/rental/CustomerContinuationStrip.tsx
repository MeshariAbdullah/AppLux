import { CheckIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { useT } from '@/lib/i18n';

// =====================================================================
// CustomerContinuationStrip
// =====================================================================
// A short, calm 5-step strip showing the customer where they are in
// the rental continuation flow AFTER the merchant has issued the
// offer + contract. Replaces the 7-stage RentalJourneyTimeline on
// customer pre-payment surfaces — that timeline has more detail than
// this stage needs.
//
// Steps:
//   1. offer-and-contract  — merchant has issued the package
//   2. review              — customer reviews and approves
//   3. payment             — customer pays the fees
//   4. nafath              — customer signs the note in Nafath (outside)
//   5. activation          — Lend verifies & merchant is notified
//
// One-word labels, one row each, done/current/pending dots. No card
// bodies, no descriptions, no badges. This is a status strip, not a
// system-of-record timeline.
// =====================================================================

export type ContinuationStep =
  | 'offer-and-contract'
  | 'review'
  | 'payment'
  | 'nafath'
  | 'activation'
  // Simplified-journey steps (ENABLE_PAYMENTS_AND_NOTES = false):
  | 'started'
  | 'closure';

const LEGACY_ORDER: ContinuationStep[] = [
  'offer-and-contract',
  'review',
  'payment',
  'nafath',
  'activation',
];

// Approved four-stage reference journey. Labels come from the SHARED
// journey.stages.* keys so this strip, the merchant strip, and the
// timeline always read identically.
const SIMPLE_ORDER: ContinuationStep[] = [
  'offer-and-contract',
  'review',
  'started',
  'closure',
];

/** Legacy step names → their simplified equivalent, so existing call
 *  sites keep passing the same values under either flag state. */
const LEGACY_TO_SIMPLE: Partial<Record<ContinuationStep, ContinuationStep>> = {
  payment: 'started',
  nafath: 'started',
  activation: 'started',
};

const SIMPLE_LABEL_KEY: Record<string, string> = {
  'offer-and-contract': 'journey.stages.request',
  review: 'journey.stages.review',
  started: 'journey.stages.started',
  closure: 'journey.stages.closure',
};

export function CustomerContinuationStrip({
  currentStep,
}: {
  currentStep: ContinuationStep;
}) {
  const t = useT();
  const ORDER = ENABLE_PAYMENTS_AND_NOTES ? LEGACY_ORDER : SIMPLE_ORDER;
  const normalizedStep = ENABLE_PAYMENTS_AND_NOTES
    ? currentStep
    : (LEGACY_TO_SIMPLE[currentStep] ?? currentStep);
  const activeIdx = ORDER.indexOf(normalizedStep);
  return (
    <section className="rounded-xl3 bg-white hairline shadow-soft px-5 py-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-lavender-700">
        {t('continuation.title')}
      </div>
      <ol className="mt-3 space-y-2">
        {ORDER.map((step, i) => {
          const done = i < activeIdx;
          const isCurrent = i === activeIdx;
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={cn(
                  'h-6 w-6 shrink-0 rounded-full grid place-items-center text-[10.5px] font-semibold num ring-1',
                  done
                    ? 'bg-success-50 text-success-600 ring-success-500/20'
                    : isCurrent
                      ? 'bg-lavender-400 text-white ring-lavender-200'
                      : 'bg-white text-ink-400 ring-canvas-200',
                )}
                aria-hidden
              >
                {done ? <CheckIcon size={12} strokeWidth={3} /> : i + 1}
              </span>
              <div
                className={cn(
                  'text-[13px] tracking-tight leading-snug',
                  done
                    ? 'text-success-700 font-medium'
                    : isCurrent
                      ? 'text-ink-900 font-semibold'
                      : 'text-ink-500',
                )}
              >
                {ENABLE_PAYMENTS_AND_NOTES
                  ? t(`continuation.steps.${step}`)
                  : t(SIMPLE_LABEL_KEY[step] ?? `continuation.steps.${step}`)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
