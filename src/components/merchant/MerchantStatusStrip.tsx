import { CheckIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

// =====================================================================
// MerchantStatusStrip
// =====================================================================
// A tight four-step operational status shown to the merchant after a
// rental package is issued. Replaces the older customer-journey
// timeline on the merchant side — the merchant does NOT need to see the
// customer's documented journey or any platform-internal narration.
//
// Steps (kept deliberately short, operational, merchant-facing):
//   1. Request created
//   2. Awaiting customer review
//   3. Awaiting payment & Nafath signing
//   4. You'll be notified when complete
//
// `currentStep` marks which step the rental is currently in. Steps
// before it are rendered as done; steps after as pending.
// =====================================================================

export type MerchantStatusStep =
  | 'created'
  | 'customer-review'
  | 'payment-and-signing'
  | 'notify';

const ORDER: MerchantStatusStep[] = [
  'created',
  'customer-review',
  'payment-and-signing',
  'notify',
];

export function MerchantStatusStrip({
  currentStep,
  t,
}: {
  currentStep: MerchantStatusStep;
  /** Optional translator override; falls back to useT() if omitted. */
  t?: (k: string) => string;
}) {
  const useTranslator = useT();
  const tr = t ?? useTranslator;
  const activeIdx = ORDER.indexOf(currentStep);

  return (
    <section className="rounded-xl3 bg-white hairline shadow-soft px-5 py-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
        {tr('merchant.status.title')}
      </div>
      <ol className="mt-3 space-y-2.5">
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
                {tr(`merchant.status.steps.${step}`)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
