import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { ChevronIcon } from '@/components/icons';
import { useI18n } from '@/lib/i18n';

type HeaderProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  variant?: 'default' | 'hero';
  showBack?: boolean;
  className?: string;
};

export function Header({
  title,
  subtitle,
  leading,
  trailing,
  variant = 'default',
  showBack,
  className,
}: HeaderProps) {
  const navigate = useNavigate();
  const { dir } = useI18n();

  const back = showBack ? (
    <button
      type="button"
      onClick={() => navigate(-1)}
      aria-label="back"
      className={cn(
        'h-9 w-9 grid place-items-center rounded-full',
        'transition-[background-color,transform] duration-150 active:scale-95',
        variant === 'hero'
          ? 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15'
          : 'bg-ink-50 text-ink-700 hover:bg-ink-100 ring-1 ring-ink-100',
      )}
    >
      <ChevronIcon size={18} className={dir === 'rtl' ? '' : 'rotate-180'} />
    </button>
  ) : null;

  return (
    <header
      className={cn(
        'relative px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-4',
        variant === 'hero'
          ? 'bg-gradient-to-b from-ink-900 via-ink-800 to-ink-900 text-white'
          : 'bg-white/95 backdrop-blur border-b border-ink-100',
        className,
      )}
    >
      {variant === 'hero' && (
        <>
          <div
            className="pointer-events-none absolute inset-0 pattern-dots opacity-40"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -top-10 end-[-10%] h-40 w-40 rounded-full bg-gold-500/15 blur-3xl"
            aria-hidden
          />
        </>
      )}
      <div className="relative flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">{back ?? leading}</div>
        <div className="flex-1 min-w-0">
          {title && (
            <div
              className={cn(
                'font-bold truncate leading-tight',
                variant === 'hero'
                  ? 'text-[17px] text-white'
                  : 'text-[16px] text-ink-900',
              )}
            >
              {title}
            </div>
          )}
          {subtitle && (
            <div
              className={cn(
                'truncate mt-0.5 leading-snug',
                variant === 'hero'
                  ? 'text-[12.5px] text-white/70'
                  : 'text-[12px] text-ink-400',
              )}
            >
              {subtitle}
            </div>
          )}
        </div>
        {trailing && (
          <div className="flex items-center gap-2 shrink-0">{trailing}</div>
        )}
      </div>
    </header>
  );
}
