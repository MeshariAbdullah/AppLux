import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  padded?: boolean;
};

export function Card({ interactive, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl2 bg-white ring-1 ring-ink-100/80 shadow-card',
        padded && 'p-4',
        interactive &&
          'transition-[transform,box-shadow] duration-150 active:scale-[0.995] cursor-pointer hover:shadow-float hover:ring-ink-200/80',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-ink-900 truncate leading-snug">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[12.5px] text-ink-400 truncate leading-snug">
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardDivider({ className }: { className?: string }) {
  return <div className={cn('my-3 h-px bg-ink-100', className)} />;
}

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'brand';
};

const toneBg: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-ink-50 text-ink-700 ring-ink-200/60',
  success: 'bg-success-50 text-success-600 ring-success-500/15',
  warn: 'bg-warn-50 text-warn-600 ring-warn-500/20',
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  brand: 'bg-brand-50 text-brand-600 ring-brand-500/15',
};

export function StatCard({ label, value, hint, icon, tone = 'default' }: StatCardProps) {
  return (
    <Card padded className="flex items-start gap-3">
      {icon && (
        <div
          className={cn(
            'h-10 w-10 rounded-xl grid place-items-center shrink-0 ring-1 ring-inset',
            toneBg[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold text-ink-400 uppercase tracking-wide">
          {label}
        </div>
        <div className="mt-1 text-[20px] leading-tight font-bold text-ink-900 num truncate">
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[12px] text-ink-500 leading-snug">{hint}</div>}
      </div>
    </Card>
  );
}
