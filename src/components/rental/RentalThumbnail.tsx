import type { ReactNode } from 'react';
import {
  BagIcon,
  BishtIcon,
  DressIcon,
  PackageIcon,
  WatchIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

export type RentalThumbnailCategory =
  | 'dress'
  | 'bag'
  | 'watch'
  | 'bisht'
  | 'dresses'
  | 'bags'
  | 'watches'
  | 'bishts';

type Tone = 'canvas' | 'gold' | 'ink';
type Size = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<Size, { box: string; icon: number }> = {
  sm: { box: 'h-11 w-11 rounded-2xl', icon: 18 },
  md: { box: 'h-12 w-12 rounded-2xl', icon: 20 },
  lg: { box: 'h-14 w-14 rounded-xl2', icon: 22 },
};

function normalize(c: RentalThumbnailCategory): 'dress' | 'bag' | 'watch' | 'bisht' {
  if (c === 'dresses') return 'dress';
  if (c === 'bags') return 'bag';
  if (c === 'watches') return 'watch';
  if (c === 'bishts') return 'bisht';
  return c;
}

function inferFromTitle(title?: string): RentalThumbnailCategory | undefined {
  if (!title) return undefined;
  const s = title.toLowerCase();
  if (s.includes('فستان') || s.includes('dress') || s.includes('gown')) return 'dress';
  if (s.includes('حقيبة') || s.includes('bag') || s.includes('clutch')) return 'bag';
  if (s.includes('ساعة') || s.includes('watch') || s.includes('chrono')) return 'watch';
  if (s.includes('بشت') || s.includes('bisht')) return 'bisht';
  return undefined;
}

function iconFor(
  category: 'dress' | 'bag' | 'watch' | 'bisht' | undefined,
  size: number,
): ReactNode {
  if (category === 'dress') return <DressIcon size={size} />;
  if (category === 'bag') return <BagIcon size={size} />;
  if (category === 'watch') return <WatchIcon size={size} />;
  if (category === 'bisht') return <BishtIcon size={size} />;
  return <PackageIcon size={size} />;
}

export function RentalThumbnail({
  category,
  title,
  size = 'md',
  tone = 'canvas',
  className,
  decorative = true,
}: {
  category?: RentalThumbnailCategory;
  title?: string;
  size?: Size;
  tone?: Tone;
  className?: string;
  decorative?: boolean;
}) {
  const resolved = category
    ? normalize(category)
    : inferFromTitle(title)
      ? normalize(inferFromTitle(title)!)
      : undefined;
  const { box, icon } = SIZE_CLASS[size];
  const skin =
    tone === 'gold'
      ? 'bg-gold-50 text-gold-700 ring-1 ring-gold-400/20'
      : tone === 'ink'
        ? 'bg-ink-900/[0.04] text-ink-700 hairline'
        : 'bg-canvas-100 text-ink-700 hairline';
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      className={cn(
        'shrink-0 grid place-items-center overflow-hidden relative',
        box,
        skin,
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent"
      />
      <span className="relative">{iconFor(resolved, icon)}</span>
    </span>
  );
}
