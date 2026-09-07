import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// =====================================================================
// PageContainer — THE horizontal rhythm of every screen.
// =====================================================================
// The MobileShell column widens on tablets/desktop (720/960/1080px);
// raw `px-5` wrappers written for a 440px phone would let content
// stretch edge-to-edge across that width. Every page body therefore
// sits in a PageContainer: a centered, max-width column with the
// shared responsive gutters.
//
//   narrow  → 520px  auth/forms — a form column should read as a form,
//                    not a banner
//   default → 640px  reading/list column (also what padded <Screen>
//                    applies automatically)
//   wide    → 1024px detail pages that open into a two-column
//                    DetailLayout, dashboards with grids
//   full    → no cap (rare; full-bleed art like the scanner)
//
// Gutters scale with the shell: 20px phones → 32px tablets. All
// spacing uses logical/`mx-auto` primitives, so RTL needs nothing
// special.
// =====================================================================

export type PageWidth = 'narrow' | 'default' | 'wide' | 'full';

// The classes live in index.css (@layer components) so plain-JSX
// wrappers can use the identical column without importing a component.
const WIDTHS: Record<PageWidth, string> = {
  narrow: 'container-narrow',
  default: 'container-page',
  wide: 'container-wide',
  full: 'container-full',
};

type PageContainerProps = {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
};

export function PageContainer({
  children,
  width = 'default',
  className,
}: PageContainerProps) {
  return <div className={cn(WIDTHS[width], className)}>{children}</div>;
}
