import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';

// The customer-side review wizard intentionally has THREE steps —
// offer → contract → confirm. There is no "note" step here:
// the promissory note doesn't exist yet at this stage. The note
// is issued by the platform AFTER payment and is approved by the
// customer in Nafath, outside the platform.
export type ReviewStepKey = 'invoice' | 'contract' | 'confirm';

const ORDER: ReviewStepKey[] = ['invoice', 'contract', 'confirm'];

type Props = {
  active: ReviewStepKey;
};

export function ReviewStepper({ active }: Props) {
  const t = useT();
  const activeIdx = ORDER.indexOf(active);

  return (
    <div className="px-5 pt-3 pb-4 bg-canvas-50/85 backdrop-blur-md">
      <ol className="flex items-center gap-1.5">
        {ORDER.map((s, i) => {
          const done = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <li key={s} className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'h-7 w-7 rounded-full grid place-items-center text-[11px] font-semibold shrink-0',
                    'transition-[background-color,color,box-shadow] duration-200 ease-plush',
                    done && 'bg-gold-400 text-ink-950',
                    isActive && 'bg-ink-900 text-white shadow-soft',
                    !done && !isActive && 'bg-canvas-200 text-ink-400',
                  )}
                >
                  {done ? (
                    <CheckIcon size={13} strokeWidth={2.5} />
                  ) : (
                    <span className="num">{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[11.5px] font-medium truncate tracking-tight',
                    isActive
                      ? 'text-ink-900'
                      : done
                        ? 'text-gold-700'
                        : 'text-ink-400',
                  )}
                >
                  {t(`review.steps.${s}`)}
                </span>
              </div>
              {i < ORDER.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-px rounded-full',
                    done ? 'bg-gold-300' : 'bg-canvas-300',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
