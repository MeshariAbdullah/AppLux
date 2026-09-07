import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// =====================================================================
// DetailLayout — detail pages: single column on phones, two intentional
// columns on iPad-landscape/desktop (lg ≥1024px).
// =====================================================================
// `main` carries the page's core content (claim data, evidence,
// timelines); `aside` carries the summary/status/actions rail. On lg
// the aside becomes a sticky rail beside the main column; below lg
// both stack in their DOM order, so the phone experience is unchanged.
//
// DOM order controls the PHONE order (set `asideFirst` when the
// summary already leads the page today); on lg, explicit column
// placement pins main to the wide start columns and aside to the end
// column regardless of DOM order. Grid columns follow the writing
// direction, so in Arabic the main column sits on the RIGHT and the
// rail on the left — correct RTL reading order for free.
//
// The aside sticks to the top of the <Screen> scroller (the app's one
// scroll region), keeping status/actions visible while the long main
// column scrolls.
// =====================================================================

type DetailLayoutProps = {
  main: ReactNode;
  aside: ReactNode;
  /** Render the aside before main in the DOM (phone order). */
  asideFirst?: boolean;
  mainClassName?: string;
  asideClassName?: string;
  className?: string;
};

export function DetailLayout({
  main,
  aside,
  asideFirst = false,
  mainClassName,
  asideClassName,
  className,
}: DetailLayoutProps) {
  const mainEl = (
    <div
      className={cn(
        'min-w-0 space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1',
        mainClassName,
      )}
    >
      {main}
    </div>
  );
  const asideEl = (
    <div
      className={cn(
        'min-w-0 space-y-4 lg:col-start-3 lg:row-start-1 lg:sticky lg:top-5',
        asideClassName,
      )}
    >
      {aside}
    </div>
  );
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6 lg:items-start',
        className,
      )}
    >
      {asideFirst ? (
        <>
          {asideEl}
          {mainEl}
        </>
      ) : (
        <>
          {mainEl}
          {asideEl}
        </>
      )}
    </div>
  );
}
