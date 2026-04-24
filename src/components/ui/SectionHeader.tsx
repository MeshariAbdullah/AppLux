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
        {icon && <span className="text-ink-400 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-ink-900 truncate leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-[12px] text-ink-400 truncate leading-snug">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="text-[12px] font-semibold text-gold-600 shrink-0 hover:text-gold-500 transition-colors">
          {action}
        </div>
      )}
    </div>
  );
}
