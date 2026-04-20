import { cn } from '@/lib/cn';

type ProgressBarProps = {
  value: number;
  max?: number;
  tone?: 'brand' | 'gold' | 'success' | 'warn' | 'danger' | 'white';
  size?: 'sm' | 'md';
  className?: string;
};

const toneClass = {
  brand: 'bg-brand-500',
  gold: 'bg-gold-500',
  success: 'bg-success-500',
  warn: 'bg-warn-500',
  danger: 'bg-danger-500',
  white: 'bg-white',
};

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  size = 'md',
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'w-full overflow-hidden rounded-full bg-ink-100',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', toneClass[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
