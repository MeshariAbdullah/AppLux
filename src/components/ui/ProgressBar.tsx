import { cn } from '@/lib/cn';

type ProgressBarProps = {
  value: number;
  max?: number;
  tone?: 'brand' | 'gold' | 'success' | 'warn' | 'danger' | 'white';
  size?: 'sm' | 'md';
  className?: string;
};

const toneClass = {
  brand: 'bg-gradient-to-r from-brand-500 to-brand-600',
  gold: 'bg-gradient-to-r from-gold-400 to-gold-600',
  success: 'bg-gradient-to-r from-success-500 to-success-600',
  warn: 'bg-gradient-to-r from-warn-500 to-warn-600',
  danger: 'bg-gradient-to-r from-danger-500 to-danger-600',
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
        'w-full overflow-hidden rounded-full bg-ink-100/80 ring-1 ring-inset ring-ink-100',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          toneClass[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
