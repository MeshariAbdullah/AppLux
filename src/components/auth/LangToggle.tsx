import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

type LangToggleProps = {
  tone?: 'light' | 'dark';
};

export function LangToggle({ tone = 'dark' }: LangToggleProps) {
  const { locale, setLocale } = useI18n();
  const isLight = tone === 'light';
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
