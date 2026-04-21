import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'brand' | 'gold' | 'warn' | 'danger' | 'success';
  className?: string;
  compact?: boolean;
};

const toneClass: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  default: 'bg-ink-50 text-ink-500 ring-ink-200/60',
  brand: 'bg-brand-50 text-brand-600 ring-brand-500/15',
  gold: 'bg-[#FBF2DD] text-gold-600 ring-gold-500/25',
  warn: 'bg-warn-50 text-warn-600 ring-warn-500/20',
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  success: 'bg-success-50 text-success-600 ring-success-500/20',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'default',
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-xl2 bg-white ring-1 ring-ink-100/80 animate-fade-in',
        compact ? 'px-5 py-8' : 'px-6 py-12',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'rounded-2xl grid place-items-center mb-3 ring-1 ring-inset',
            compact ? 'h-12 w-12' : 'h-14 w-14',
            toneClass[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="text-[15px] font-semibold text-ink-900 leading-snug">{title}</div>
      {description && (
        <div className="mt-1 text-[13px] text-ink-400 max-w-xs leading-relaxed">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
