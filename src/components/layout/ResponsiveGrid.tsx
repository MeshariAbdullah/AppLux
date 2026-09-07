import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// =====================================================================
// ResponsiveGrid — card/list grids that stay one column on phones and
// open up on tablets/desktop.
// =====================================================================
// Tailwind can't build class names at runtime, so the per-breakpoint
// column counts map to literal class strings here. Grid auto-placement
// follows the writing direction, so RTL fills right-to-left with no
// extra work. `minmax(0,1fr)` semantics come from grid children being
// `min-w-0` by default in these maps' parent (items get `min-w-0` via
// the wrapper below) so truncation keeps working inside cells.
// =====================================================================

type Cols = 1 | 2 | 3 | 4;

const SM: Record<Cols, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};
const MD: Record<Cols, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};
const LG: Record<Cols, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

type ResponsiveGridProps = {
  children: ReactNode;
  /** Columns at ≥640px (large phones). */
  sm?: Cols;
  /** Columns at ≥768px (iPad portrait). */
  md?: Cols;
  /** Columns at ≥1024px (iPad landscape / desktop). */
  lg?: Cols;
  className?: string;
};

export function ResponsiveGrid({
  children,
  sm,
  md,
  lg,
  className,
}: ResponsiveGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 items-start [&>*]:min-w-0',
        sm && SM[sm],
        md && MD[md],
        lg && LG[lg],
        className,
      )}
    >
      {children}
    </div>
  );
}
