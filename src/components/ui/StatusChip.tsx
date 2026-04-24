import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'gold';

const toneClass: Record<StatusTone, string> = {
  neutral: 'bg-canvas-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warn: 'bg-warn-50 text-warn-700',
  danger: 'bg-danger-50 text-danger-700',
  gold: 'bg-gold-50 text-gold-700',
};

const dotClass: Record<StatusTone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warn: 'bg-warn-500',
  danger: 'bg-danger-500',
  gold: 'bg-gold-400',
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
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap leading-none',
        size === 'sm' ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-[12px]',
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
