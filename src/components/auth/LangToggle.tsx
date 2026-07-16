import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

type LangToggleProps = {
  tone?: 'light' | 'dark';
  /** Single slim text button (shows the OTHER language) instead of the
      two-pill switch — for screens where the design gives the language
      control minimal visual weight (M01 merchant welcome). */
  compact?: boolean;
};

export function LangToggle({ tone = 'dark', compact = false }: LangToggleProps) {
  const { locale, setLocale } = useI18n();
  const isLight = tone === 'light';
  if (compact) {
    const other = locale === 'ar' ? 'en' : 'ar';
    return (
      <button
        type="button"
        onClick={() => setLocale(other)}
        className={cn(
          'px-2.5 py-1 rounded-full text-[11.5px] font-semibold ring-1 ring-inset transition-colors',
          isLight
            ? 'text-white/75 ring-white/20 hover:text-white'
            : 'text-ink-500 ring-ink-200 hover:text-ink-900',
        )}
      >
        {other === 'ar' ? 'العربية' : 'English'}
      </button>
    );
  }
  return (
    <div
      className={cn(
        'inline-flex rounded-full p-0.5 ring-1 ring-inset',
        isLight ? 'bg-white/10 ring-white/15' : 'bg-ink-100 ring-ink-100',
      )}
    >
      {(['ar', 'en'] as const).map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={cn(
              'px-3 py-1 text-[12px] font-semibold rounded-full transition-colors',
              active
                ? isLight
                  ? 'bg-white text-ink-900'
                  : 'bg-ink-900 text-white'
                : isLight
                  ? 'text-white/80'
                  : 'text-ink-500',
            )}
          >
            {l === 'ar' ? 'العربية' : 'English'}
          </button>
        );
      })}
    </div>
  );
}
