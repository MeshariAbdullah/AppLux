import { cn } from '@/lib/cn';

type ProgressBarProps = {
  value: number;
  max?: number;
  tone?: 'brand' | 'gold' | 'success' | 'warn' | 'danger' | 'white';
  size?: 'sm' | 'md';
  className?: string;
};

const toneClass = {
  // Default to a soft gold-bronze ribbon — luxury default rather than harsh blue.
  brand: 'bg-gradient-to-r from-gold-300 to-gold-500',
  gold: 'bg-gradient-to-r from-gold-300 to-gold-500',
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
        'w-full overflow-hidden rounded-full bg-canvas-200/70',
        size === 'sm' ? 'h-1' : 'h-1.5',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-plush',
          toneClass[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
