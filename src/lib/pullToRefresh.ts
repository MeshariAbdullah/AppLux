// =====================================================================
// Pull-to-refresh gesture controller — framework-free.
//
// The touch math and state machine live here, decoupled from React and
// the DOM, so the exact release/threshold/refresh behavior is unit-
// testable in plain Node (scripts/pull-to-refresh.test.mjs). The
// <Screen> layout component owns the DOM wiring: it feeds touch
// samples in and applies the visual effects the controller asks for.
//
// Behavior (standard iOS semantics):
//   * The gesture arms only when the scroller is at the very top —
//     mid-list scrolling is never intercepted.
//   * Downward drag past the top moves the indicator with resistance,
//     capped, and asks the host to preventDefault so the native
//     rubber-band doesn't fight the gesture.
//   * Release past the threshold → 'refreshing': the indicator locks
//     open, onRefresh() runs, and the spinner holds for a minimum
//     duration so an instant (cached) resolve still reads as a
//     refresh instead of a flicker.
//   * Release short of the threshold, or an upward/side scroll, snaps
//     the indicator closed with no refresh.
//   * While refreshing, new pulls are ignored — one gesture, one
//     onRefresh() call. A rejected onRefresh() still closes cleanly
//     (pages surface their own error states).
// =====================================================================

export type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing';

/** Release at or past this indicator travel triggers a refresh. */
export const PULL_REFRESH_THRESHOLD_PX = 64;
/** Hard cap on indicator travel however far the finger goes. */
export const PULL_MAX_PX = 112;
/** Finger-to-indicator ratio (drag "resistance"). */
export const PULL_RESISTANCE = 0.42;
/** Spinner floor — a refresh that resolves instantly (memory cache,
 *  demo store) still shows a perceivable refresh cycle. */
export const PULL_MIN_SPIN_MS = 600;

export type PullToRefreshHost = {
  /** Current scrollTop of the scroll container. */
  getScrollTop: () => number;
  /** Move the pulled content: offset in px, animated on release. */
  setOffset: (px: number, animate: boolean) => void;
  /** Phase changes for the indicator UI. */
  setPhase: (phase: PullPhase) => void;
  /** The page's data refresh. May resolve to anything or throw. */
  onRefresh: () => unknown;
  /** Injectable clock/timer for tests. */
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
};

export type TouchSample = { y: number };

export type PullToRefreshController = {
  touchStart: (s: TouchSample) => void;
  /** Returns true when the host must preventDefault the touchmove. */
  touchMove: (s: TouchSample) => boolean;
  touchEnd: () => void;
  /** Drop listeners' effects; safe to call mid-gesture (unmount). */
  destroy: () => void;
  /** Current phase — exposed for tests and idempotent wiring. */
  getPhase: () => PullPhase;
};

export function pullOffsetFor(dragPx: number): number {
  if (dragPx <= 0) return 0;
  return Math.min(dragPx * PULL_RESISTANCE, PULL_MAX_PX);
}

export function createPullToRefreshController(
  host: PullToRefreshHost,
): PullToRefreshController {
  const now = host.now ?? (() => Date.now());
  const delay =
    host.delay ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let phase: PullPhase = 'idle';
  let armed = false;
  let startY = 0;
  let offset = 0;
  let destroyed = false;

  const setPhase = (p: PullPhase) => {
    if (destroyed || phase === p) return;
    phase = p;
    host.setPhase(p);
  };

  const close = (animate: boolean) => {
    offset = 0;
    if (!destroyed) host.setOffset(0, animate);
    setPhase('idle');
  };

  return {
    touchStart(s) {
      if (destroyed || phase === 'refreshing') return;
      // Arm only at the very top — elsewhere the gesture is a scroll.
      armed = host.getScrollTop() <= 0;
      startY = s.y;
    },

    touchMove(s) {
      if (destroyed || !armed || phase === 'refreshing') return false;
      const drag = s.y - startY;
      if (host.getScrollTop() > 0 || drag <= 0) {
        // Content took over (scrolled down / finger moved up):
        // release anything we pulled and stay out of the way.
        if (offset > 0) close(false);
        armed = drag > 0; // an upward move disarms until the next start
        return false;
      }
      offset = pullOffsetFor(drag);
      host.setOffset(offset, false);
      setPhase(offset >= PULL_REFRESH_THRESHOLD_PX ? 'ready' : 'pulling');
      // We own this gesture — stop the native scroll/rubber-band.
      return true;
    },

    touchEnd() {
      if (destroyed || phase === 'refreshing') return;
      armed = false;
      if (offset < PULL_REFRESH_THRESHOLD_PX) {
        close(true);
        return;
      }
      setPhase('refreshing');
      offset = 0;
      host.setOffset(PULL_REFRESH_THRESHOLD_PX, true);
      const startedAt = now();
      Promise.resolve()
        .then(() => host.onRefresh())
        .catch(() => {
          // Pages own their error UI — the gesture just closes.
        })
        .then(() => {
          const elapsed = now() - startedAt;
          const hold = Math.max(0, PULL_MIN_SPIN_MS - elapsed);
          return hold > 0 ? delay(hold) : undefined;
        })
        .then(() => close(true));
    },

    destroy() {
      destroyed = true;
    },

    getPhase: () => phase,
  };
}
