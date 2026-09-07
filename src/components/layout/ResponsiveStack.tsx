import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// =====================================================================
// ResponsiveStack — vertical on phones, horizontal from a breakpoint.
// =====================================================================
// For action rows, stat strips and header meta that cramp side-by-side
// on a phone but waste height stacked on a tablet. Flex `row` follows
// the writing direction, so RTL order is automatic.
// =====================================================================

type ResponsiveStackProps = {
  children: ReactNode;
  /** Breakpoint where the stack turns horizontal (default 'md'). */
  from?: 'sm' | 'md' | 'lg';
  className?: string;
};

const FROM: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'sm:flex-row sm:items-center',
  md: 'md:flex-row md:items-center',
  lg: 'lg:flex-row lg:items-center',
};

export function ResponsiveStack({
  children,
  from = 'md',
  className,
}: ResponsiveStackProps) {
  return (
    <div className={cn('flex flex-col gap-3 [&>*]:min-w-0', FROM[from], className)}>
      {children}
    </div>
  );
}
