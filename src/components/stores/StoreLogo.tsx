import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { PartnerStore } from '@/lib/data';
import {
  BagIcon,
  BishtIcon,
  DressIcon,
  PackageIcon,
  WatchIcon,
} from '@/components/icons';

type StoreLogoProps = {
  store: PartnerStore;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: 'h-11 w-11 text-[11px] rounded-2xl',
  md: 'h-14 w-14 text-[13px] rounded-2xl',
  lg: 'h-20 w-20 text-[16px] rounded-3xl',
};

// All boutique avatars share a single calm cream surface — letting the
// store initials and the category mark do the talking. The accent
// colour shows only as a subtle bottom-right initials chip.
const toneMap: Record<PartnerStore['logoTone'], { bg: string; fg: string; chip: string }> = {
  brand: { bg: 'bg-canvas-100', fg: 'text-ink-800', chip: 'text-brand-700' },
  gold: { bg: 'bg-gold-50', fg: 'text-gold-700', chip: 'text-gold-700' },
  ink: { bg: 'bg-canvas-200/80', fg: 'text-ink-800', chip: 'text-ink-800' },
  success: { bg: 'bg-success-50', fg: 'text-success-700', chip: 'text-success-700' },
};

export function categoryIcon(category: PartnerStore['category'], size = 16): ReactNode {
  switch (category) {
    case 'dresses':
      return <DressIcon size={size} />;
    case 'bags':
      return <BagIcon size={size} />;
    case 'watches':
      return <WatchIcon size={size} />;
    case 'bishts':
      return <BishtIcon size={size} />;
    default:
      return <PackageIcon size={size} />;
  }
}

export function StoreLogo({ store, size = 'md', className }: StoreLogoProps) {
  const tone = toneMap[store.logoTone];
  const iconSize = size === 'lg' ? 30 : size === 'md' ? 24 : 20;
  return (
    <div
      className={cn(
        'relative grid place-items-center font-semibold tracking-tight shrink-0 hairline',
        sizeMap[size],
        tone.bg,
        tone.fg,
        className,
      )}
      aria-hidden
    >
      <span className="opacity-90">{categoryIcon(store.category, iconSize)}</span>
      <span
        className={cn(
          'absolute -bottom-1.5 end-[-6px] h-5 min-w-[22px] px-1.5 grid place-items-center',
          'rounded-full bg-white shadow-soft hairline text-[9.5px] font-bold leading-none',
          tone.chip,
        )}
      >
        {store.initials}
      </span>
    </div>
  );
}
