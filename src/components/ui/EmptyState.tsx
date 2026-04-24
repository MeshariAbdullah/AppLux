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
  default: 'bg-canvas-100 text-ink-500',
  brand: 'bg-brand-50 text-brand-600',
  gold: 'bg-gold-50 text-gold-600',
  warn: 'bg-warn-50 text-warn-600',
  danger: 'bg-danger-50 text-danger-600',
  success: 'bg-success-50 text-success-600',
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
        'flex flex-col items-center justify-center text-center rounded-xl3 bg-white hairline animate-fade-in',
        compact ? 'px-6 py-10' : 'px-7 py-14',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'rounded-2xl grid place-items-center mb-4',
            compact ? 'h-12 w-12' : 'h-14 w-14',
            toneClass[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="text-[16px] font-semibold text-ink-900 leading-snug tracking-tight">
        {title}
      </div>
      {description && (
        <div className="mt-1.5 text-[13px] text-ink-400 max-w-xs leading-relaxed">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
