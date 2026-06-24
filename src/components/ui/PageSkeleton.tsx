import { Skeleton } from './Skeleton';
import { cn } from '@/lib/cn';

// =====================================================================
// PageSkeleton — shared loading shape for data-driven pages while a
// Supabase query resolves. Renders three stacked card-shaped skeletons
// with a leading-line-then-paragraph rhythm so the loading state looks
// like the real card it's standing in for (not a generic spinner).
//
// Use this wherever a list/detail page would otherwise risk showing
// an empty state or — worse — a flash of demo data. The accompanying
// `EmptyState` component is rendered AFTER the query resolves to []
// (genuinely no data), so the two are never both onscreen.
// =====================================================================

export function PageSkeleton({
  rows = 3,
  className,
  ariaLabel = 'Loading…',
}: {
  rows?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn('space-y-3 animate-fade-in', className)}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl3 bg-white hairline shadow-soft p-4 space-y-3"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Inline single-card skeleton — for tracking/detail pages where the
// whole page is a single entity card while loading.
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl3 bg-white hairline shadow-soft p-5 space-y-3 animate-fade-in',
        className,
      )}
      role="status"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="pt-2 grid grid-cols-2 gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
