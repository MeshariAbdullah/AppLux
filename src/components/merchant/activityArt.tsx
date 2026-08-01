import type { ReactNode } from 'react';

// =====================================================================
// Activity illustrations — consistent 2px line-art, currentColor, no
// external assets (inline SVG so the CSP-strict shell and iOS bundle
// stay self-contained; no remote hotlinks, no heavy photos). Each is
// decorative — the accessible name comes from the picker's label.
// =====================================================================

type ArtProps = { size?: number; className?: string };

const wrap = (children: ReactNode, size: number, className?: string) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export function DressArt({ size = 40, className }: ArtProps) {
  return wrap(
    <>
      <path d="M18 8h12l-3 6 4 5-3 3 4 17H16l4-17-3-3 4-5-3-6Z" />
      <path d="M20 14h8" />
    </>,
    size,
    className,
  );
}

export function BagArt({ size = 40, className }: ArtProps) {
  return wrap(
    <>
      <path d="M12 18h24l-2 22H14L12 18Z" />
      <path d="M18 18v-3a6 6 0 0 1 12 0v3" />
    </>,
    size,
    className,
  );
}

export function WatchArt({ size = 40, className }: ArtProps) {
  return wrap(
    <>
      <circle cx="24" cy="24" r="9" />
      <path d="M24 20v4l3 2" />
      <path d="M19 15l1-6h8l1 6M19 33l1 6h8l1-6" />
    </>,
    size,
    className,
  );
}

export function BishtArt({ size = 40, className }: ArtProps) {
  return wrap(
    <>
      <path d="M16 8l-5 6 4 3-3 21h22l-3-21 4-3-5-6Z" />
      <path d="M24 11v27" />
      <path d="M18 12h12" />
    </>,
    size,
    className,
  );
}

export function GenericActivityArt({ size = 40, className }: ArtProps) {
  return wrap(
    <>
      <path d="M14 12h20l-2 24H16L14 12Z" />
      <path d="M20 12v-2a4 4 0 0 1 8 0v2" />
    </>,
    size,
    className,
  );
}

/** Category key → illustration, with a neutral fallback. */
export function ActivityArt({
  category,
  size,
  className,
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  switch (category) {
    case 'dress':
      return <DressArt size={size} className={className} />;
    case 'bag':
      return <BagArt size={size} className={className} />;
    case 'watch':
      return <WatchArt size={size} className={className} />;
    case 'bisht':
      return <BishtArt size={size} className={className} />;
    default:
      return <GenericActivityArt size={size} className={className} />;
  }
}
