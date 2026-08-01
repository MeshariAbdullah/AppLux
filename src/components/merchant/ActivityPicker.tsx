import { CheckIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { ActivityArt } from './activityArt';

// =====================================================================
// Multi-select activity picker — one or more store activities. Cards
// toggle (tap a selected card again to remove); ≥1 required. Fully
// keyboard + screen-reader accessible (a listbox of toggle options).
// RTL/LTR-neutral (logical properties + grid).
// =====================================================================

export const ACTIVITY_KEYS = ['dress', 'bag', 'watch', 'bisht'] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

export function ActivityPicker({
  selected,
  onToggle,
  invalid,
}: {
  selected: string[];
  onToggle: (key: ActivityKey) => void;
  invalid?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      aria-label={t('merchant.register.activities.title')}
      className={cn(
        'grid grid-cols-2 gap-3',
        invalid && 'rounded-xl2 ring-1 ring-danger-500/50 p-1',
      )}
    >
      {ACTIVITY_KEYS.map((key) => {
        const isSelected = selected.includes(key);
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onToggle(key)}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-xl2 border p-4 text-center transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-400',
              isSelected
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-beige-200 bg-white text-ink-700 hover:border-beige-300',
            )}
          >
            {isSelected && (
              <span className="absolute top-2 end-2 grid h-5 w-5 place-items-center rounded-full bg-green-600 text-white">
                <CheckIcon size={12} />
              </span>
            )}
            <ActivityArt
              category={key}
              size={38}
              className={isSelected ? 'text-green-700' : 'text-ink-400'}
            />
            <span className="text-[12.5px] font-semibold leading-tight">
              {t(`merchant.register.categories.${key}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
