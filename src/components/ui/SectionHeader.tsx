import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SectionHeaderProps = {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-3 px-1', className)}>
      <h2 className="text-[13px] font-semibold tracking-wide text-ink-900">{title}</h2>
      {action && <div className="text-[12.5px] text-brand-600 font-medium">{action}</div>}
    </div>
  );
}
