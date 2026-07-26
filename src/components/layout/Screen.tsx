import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
  className?: string;
};

export function Screen({ children, padded = true, className }: ScreenProps) {
  return (
    <main
      className={cn(
        // THE app scroller: the shell column is fixed-height, so this
        // flex-1 + min-h-0 region is the only element that scrolls.
        // overscroll-contain stops its rubber-band from chaining to
        // the (locked) document.
        'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar scroll-smooth [-webkit-overflow-scrolling:touch]',
        padded && 'px-5 pb-10 pt-5 space-y-6',
        className,
      )}
    >
      {children}
    </main>
  );
}
