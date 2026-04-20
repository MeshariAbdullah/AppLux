import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';

export type ReviewStepKey = 'invoice' | 'contract' | 'note' | 'confirm';

const ORDER: ReviewStepKey[] = ['invoice', 'contract', 'note', 'confirm'];

type Props = {
  active: ReviewStepKey;
};

export function ReviewStepper({ active }: Props) {
  const t = useT();
  const { dir } = useI18n();
  const activeIdx = ORDER.indexOf(active);

  return (
    <div className="px-4 pt-3 pb-4 bg-white border-b border-ink-100">
      <ol className="flex items-center gap-2">
        {ORDER.map((s, i) => {
          const done = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <li key={s} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'h-6 w-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 transition-colors',
                    done && 'bg-success-500 text-white',
                    isActive && 'bg-ink-900 text-white',
                    !done && !isActive && 'bg-ink-100 text-ink-500',
                  )}
                >
                  {done ? <CheckIcon size={13} strokeWidth={2.5} /> : <span className="num">{i + 1}</span>}
                </span>
                <span
                  className={cn(
                    'text-[11.5px] font-semibold truncate',
                    isActive ? 'text-ink-900' : done ? 'text-success-600' : 'text-ink-400',
                  )}
                >
                  {t(`review.steps.${s}`)}
                </span>
              </div>
              {i < ORDER.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 rounded-full transition-colors',
                    done ? 'bg-success-500' : 'bg-ink-100',
                    dir === 'rtl' && 'scale-x-[-1]',
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
