import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 rounded-xl2 bg-white ring-1 ring-ink-100',
        className,
      )}
    >
      {icon && (
        <div className="h-14 w-14 rounded-2xl bg-ink-50 text-ink-500 grid place-items-center mb-3">
          {icon}
        </div>
      )}
      <div className="text-[15px] font-semibold text-ink-900">{title}</div>
      {description && (
        <div className="mt-1 text-[13px] text-ink-400 max-w-xs leading-relaxed">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
