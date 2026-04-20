import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { PartnerStore } from '@/lib/data';
import {
  BuildingIcon,
  CarIcon,
  PackageIcon,
  ToolsIcon,
} from '@/components/icons';

type StoreLogoProps = {
  store: PartnerStore;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: 'h-10 w-10 text-[11px]',
  md: 'h-14 w-14 text-[13px]',
  lg: 'h-20 w-20 text-[16px]',
};

const toneMap: Record<PartnerStore['logoTone'], { bg: string; fg: string; ring: string }> = {
  brand: { bg: 'bg-brand-50', fg: 'text-brand-700', ring: 'ring-brand-100' },
  gold: { bg: 'bg-[#FBF2DD]', fg: 'text-gold-600', ring: 'ring-gold-400/30' },
  ink: { bg: 'bg-ink-100', fg: 'text-ink-700', ring: 'ring-ink-200' },
  success: { bg: 'bg-success-50', fg: 'text-success-600', ring: 'ring-success-500/20' },
};

export function categoryIcon(category: PartnerStore['category'], size = 16): ReactNode {
  switch (category) {
    case 'cars':
      return <CarIcon size={size} />;
    case 'properties':
      return <BuildingIcon size={size} />;
    case 'equipment':
      return <ToolsIcon size={size} />;
    default:
      return <PackageIcon size={size} />;
  }
}

export function StoreLogo({ store, size = 'md', className }: StoreLogoProps) {
  const tone = toneMap[store.logoTone];
  const iconSize = size === 'lg' ? 26 : size === 'md' ? 22 : 18;
  return (
    <div
      className={cn(
        'relative grid place-items-center rounded-2xl font-bold tracking-tight ring-1 ring-inset shrink-0',
        sizeMap[size],
        tone.bg,
        tone.fg,
        tone.ring,
        className,
      )}
      aria-hidden
    >
      <span className="opacity-90">{categoryIcon(store.category, iconSize)}</span>
      <span className="absolute -bottom-1 end-[-6px] h-5 min-w-[20px] px-1 grid place-items-center rounded-full bg-white ring-1 ring-ink-100 text-[9.5px] font-bold text-ink-700 shadow-soft">
        {store.initials}
      </span>
    </div>
  );
}
