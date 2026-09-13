import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  PULL_REFRESH_THRESHOLD_PX,
  createPullToRefreshController,
  type PullPhase,
} from '@/lib/pullToRefresh';
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
  /**
   * Opt-in pull-to-refresh: dragging down from the very top of the
   * screen runs this callback (awaited when it returns a promise) with
   * the standard indicator. Main list/dashboard screens pass their
   * data refetch here; wizard/form screens deliberately leave it unset
   * so an accidental pull can never touch in-progress form state.
   */
  onRefresh?: () => unknown;
};

/** Touch wiring for the pull-to-refresh controller. Lives on the
 *  scroller (<main>) with a passive:false move listener — the
 *  controller decides per-move whether the gesture is ours (pulling at
 *  the top → preventDefault kills the native rubber-band) or a normal
 *  scroll (untouched). */
function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  pullerRef: React.RefObject<HTMLDivElement | null>,
  onRefresh: (() => unknown) | undefined,
): PullPhase {
  const [phase, setPhase] = useState<PullPhase>('idle');
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onRefresh) return;

    const controller = createPullToRefreshController({
      getScrollTop: () => el.scrollTop,
      setOffset: (px, animate) => {
        const puller = pullerRef.current;
        if (!puller) return;
        puller.style.transition = animate
          ? 'transform 0.25s cubic-bezier(0.2, 0.7, 0.3, 1)'
          : 'none';
        puller.style.transform = `translate3d(0, ${px}px, 0)`;
      },
      setPhase,
      onRefresh: () => onRefreshRef.current?.(),
    });

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) controller.touchStart({ y: t.clientY });
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (controller.touchMove({ y: t.clientY }) && e.cancelable) {
        e.preventDefault();
      }
    };
    const onTouchEnd = () => controller.touchEnd();

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      controller.destroy();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // onRefresh identity changes are handled via the ref; only its
    // presence/absence re-wires the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, pullerRef, Boolean(onRefresh)]);

  return phase;
}

function PullIndicator({ phase }: { phase: PullPhase }) {
  const t = useT();
  return (
    <div
      data-testid="pull-indicator"
      data-phase={phase}
      role="status"
      className="pointer-events-none absolute inset-x-0 flex items-end justify-center pb-3"
      style={{ top: -PULL_REFRESH_THRESHOLD_PX - 16, height: PULL_REFRESH_THRESHOLD_PX + 16 }}
    >
      {phase === 'refreshing' ? (
        <>
          <span className="h-6 w-6 rounded-full border-2 border-canvas-300 border-t-lavender-600 animate-spin" />
          <span className="sr-only">{t('common.loading')}</span>
        </>
      ) : (
        <span
          className={cn(
            'flex items-center gap-1.5 text-[13px] font-medium text-ink-400 transition-opacity',
            phase === 'idle' && 'opacity-0',
          )}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              'transition-transform duration-200',
              phase === 'ready' && 'rotate-180',
            )}
            aria-hidden
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          {t('common.pullToRefresh')}
        </span>
      )}
    </div>
  );
}

export function Screen({
  children,
  padded = true,
  width = 'default',
  className,
  onRefresh,
}: ScreenProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const pullerRef = useRef<HTMLDivElement>(null);
  const phase = usePullToRefresh(scrollRef, pullerRef, onRefresh);

  const inner = padded ? (
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
  );

  return (
    <main
      ref={scrollRef}
      className={cn(
        // THE app scroller: the shell column is fixed-height, so this
        // flex-1 + min-h-0 region is the only element that scrolls.
        // overscroll-contain stops its rubber-band from chaining to
        // the (locked) document.
        'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar scroll-smooth [-webkit-overflow-scrolling:touch]',
        className,
      )}
    >
      {onRefresh ? (
        // The transformed layer: the indicator sits above the fold and
        // is revealed as the controller translates this wrapper down.
        <div ref={pullerRef} className="relative min-h-full will-change-transform">
          <PullIndicator phase={phase} />
          {inner}
        </div>
      ) : (
        inner
      )}
    </main>
  );
}
