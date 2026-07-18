import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';

// The customer-side review wizard has FOUR steps — offer → contract →
// confirm → receipt photos (Bugs 17/19: photography moved INSIDE the
// guided acceptance flow; the rental cannot activate until the photos
// are uploaded and confirmed). There is still no "note" step here:
// the promissory note doesn't exist yet at this stage — it is issued
// by the platform AFTER payment and approved in Nafath, outside the
// platform.
//
// The photos step is post-commitment: it only becomes reachable after
// the acceptance RPC succeeds, and the wizard never navigates back
// out of it (the contract already exists).
export type ReviewStepKey = 'invoice' | 'contract' | 'confirm' | 'photos';

const ORDER: ReviewStepKey[] = ['invoice', 'contract', 'confirm', 'photos'];

type Props = {
  active: ReviewStepKey;
};

export function ReviewStepper({ active }: Props) {
  const t = useT();
  const activeIdx = ORDER.indexOf(active);

  // Customer design C09 — three segmented pills: done = white pill with
  // a green check, active = navy pill, upcoming = quiet text.
  return (
    <div className="px-5 pt-3 pb-3 bg-beige-100/90 backdrop-blur-md">
      <ol className="flex items-center gap-2">
        {ORDER.map((s, i) => {
          const done = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <li key={s} className="flex-1 min-w-0">
              <span
                className={cn(
                  'flex items-center justify-center gap-1.5 h-9 rounded-full text-[12.5px] font-bold truncate px-2',
                  'transition-colors duration-200 ease-plush',
                  isActive && 'bg-navy-700 text-white',
                  done && 'bg-white ring-1 ring-beige-200 text-green-700',
                  !done && !isActive && 'text-ink-400',
                )}
              >
                {done && <CheckIcon size={12} strokeWidth={2.5} />}
                {t(`review.steps.${s}`)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
