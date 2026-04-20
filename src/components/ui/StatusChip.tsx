import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'gold';

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-ink-50 text-ink-600 ring-ink-100',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-success-50 text-success-600 ring-success-500/20',
  warn: 'bg-warn-50 text-warn-600 ring-warn-500/25',
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  gold: 'bg-[#FBF2DD] text-gold-600 ring-gold-400/30',
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
        'inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium whitespace-nowrap',
        size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12.5px]',
        toneClass[tone],
        className,
      )}
    >
      {icon ? (
        <span className="-mx-0.5 grid place-items-center">{icon}</span>
      ) : dot ? (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[tone])} />
      ) : null}
      {label}
    </span>
  );
}
