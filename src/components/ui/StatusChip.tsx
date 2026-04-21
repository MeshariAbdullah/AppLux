import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'gold';

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-ink-50 text-ink-700 ring-ink-200/70',
  brand: 'bg-brand-50 text-brand-700 ring-brand-500/15',
  success: 'bg-success-50 text-success-700 ring-success-500/20',
  warn: 'bg-warn-50 text-warn-700 ring-warn-500/25',
  danger: 'bg-danger-50 text-danger-700 ring-danger-500/20',
  gold: 'bg-[#FBF2DD] text-gold-700 ring-gold-500/25',
};

const dotClass: Record<StatusTone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warn: 'bg-warn-500',
  danger: 'bg-danger-500',
  gold: 'bg-gold-500',
};

type StatusChipProps = {
  tone?: StatusTone;
  label: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

export function StatusChip({
  tone = 'neutral',
  label,
  icon,
  dot = true,
  size = 'sm',
  className,
}: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-semibold whitespace-nowrap leading-none',
        size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]',
        toneClass[tone],
        className,
      )}
    >
      {icon ? (
        <span className="-mx-0.5 grid place-items-center shrink-0">{icon}</span>
      ) : dot ? (
        <span
          className={cn(
            'rounded-full shrink-0',
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-[7px] w-[7px]',
            dotClass[tone],
          )}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
