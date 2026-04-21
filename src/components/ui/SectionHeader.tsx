import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SectionHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3 mb-3 px-1', className)}>
      <div className="min-w-0 flex items-center gap-2">
        {icon && <span className="text-ink-500 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-wide text-ink-900 truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[11.5px] text-ink-400 truncate leading-snug">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="text-[12px] font-semibold text-brand-700 shrink-0">{action}</div>
      )}
    </div>
  );
}
