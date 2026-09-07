import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// =====================================================================
// FormGrid — forms: one column on phones, two on tablets/desktop.
// =====================================================================
// Wrap a run of related fields; each direct child takes one cell. A
// field that should span the full row on tablets too (long text
// inputs, textareas, section notes, submit rows) opts in with the
// exported `formGridFull` class — grid placement, so DOM/tab order is
// untouched and RTL cell flow follows the writing direction.
//
// Use it only where side-by-side genuinely reads better (first/last
// name, date pairs, amount + unit). A wizard step that interviews the
// user one decision at a time should stay single column — that is a
// deliberate non-use, not a gap.
// =====================================================================

/** Spans a FormGrid child across the full row at md+. */
export const formGridFull = 'md:col-span-2';

type FormGridProps = {
  children: ReactNode;
  /** Keep one column on tablets as well (rarely needed). */
  single?: boolean;
  className?: string;
};

export function FormGrid({ children, single = false, className }: FormGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 items-start [&>*]:min-w-0',
        !single && 'md:grid-cols-2 md:gap-x-4 md:gap-y-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
