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
        // Soft warm surface, very thin warm hairline, plush shadow.
        'rounded-xl3 bg-white hairline shadow-card',
        padded && 'p-5',
        interactive &&
          'transition-[transform,box-shadow] duration-200 ease-plush ' +
            'active:scale-[0.997] cursor-pointer hover:shadow-plush',
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
        <div className="text-[15.5px] font-semibold text-ink-900 truncate leading-snug">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 text-[12.5px] text-ink-500 truncate leading-snug">
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardDivider({ className }: { className?: string }) {
  return <div className={cn('my-4 h-px bg-canvas-200/80', className)} />;
}

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'brand' | 'gold';
};

const toneBg: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-canvas-100 text-ink-700',
  success: 'bg-success-50 text-success-700',
  warn: 'bg-warn-50 text-warn-700',
  danger: 'bg-danger-50 text-danger-700',
  brand: 'bg-brand-50 text-brand-700',
  gold: 'bg-gold-50 text-gold-700',
};

export function StatCard({ label, value, hint, icon, tone = 'default' }: StatCardProps) {
  return (
    <Card padded className="flex items-start gap-3">
      {icon && (
        <div
          className={cn(
            'h-11 w-11 rounded-2xl grid place-items-center shrink-0',
            toneBg[tone],
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
          {label}
        </div>
        <div className="mt-1.5 text-[22px] leading-tight font-bold text-ink-900 num truncate">
          {value}
        </div>
        {hint && <div className="mt-1 text-[12px] text-ink-500 leading-snug">{hint}</div>}
      </div>
    </Card>
  );
}
