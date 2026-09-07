import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { PageContainer, type PageWidth } from './PageContainer';

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
  /**
   * Content column width for padded screens (PageContainer widths).
   * 'default' = 640px reading column; pass 'wide' for pages that open
   * into a two-column DetailLayout on large screens.
   */
  width?: PageWidth;
  className?: string;
};

export function Screen({
  children,
  padded = true,
  width = 'default',
  className,
}: ScreenProps) {
  return (
    <main
      className={cn(
        // THE app scroller: the shell column is fixed-height, so this
        // flex-1 + min-h-0 region is the only element that scrolls.
        // overscroll-contain stops its rubber-band from chaining to
        // the (locked) document.
        'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar scroll-smooth [-webkit-overflow-scrolling:touch]',
        className,
      )}
    >
      {padded ? (
        // Padded screens get the shared centered content column: the
        // shell canvas widens on tablets/desktop, and this keeps every
        // page a deliberate column instead of a stretched phone
        // layout. Vertical rhythm (pt/pb/space-y) is unchanged from
        // the old padded Screen.
        <PageContainer width={width} className="pb-10 pt-5 space-y-6">
          {children}
        </PageContainer>
      ) : (
        children
      )}
    </main>
  );
}
