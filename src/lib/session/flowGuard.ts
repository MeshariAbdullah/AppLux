import { useEffect } from 'react';

// =====================================================================
// Sensitive-flow guard — lets pages mark "the user is in the middle of
// something that must not be interrupted by an idle logout":
//
//   * customer Review / contract signing
//   * merchant rental-session wizard (past the start step)
//   * payment simulation sheet while open
//   * any in-flight mutation submission (close rental, damage case,
//     invoice creation)
//
// While the count is > 0, useSessionTimeout defers BOTH the idle
// warning and the idle logout. The moment every guard releases, the
// next timer tick re-evaluates — so an idle deadline that passed
// mid-flow signs the user out right after the flow completes, exactly
// as the Phase 1 spec requires. The ABSOLUTE timeout is a hard cap and
// is deliberately NOT deferred by this guard.
//
// Plain module-level counter (no context) so the session hook can read
// it without threading providers through the tree. React 18 StrictMode
// double-invokes effects symmetrically, so acquire/release stays
// balanced.
// =====================================================================

let activeCount = 0;

export function isSensitiveFlowActive(): boolean {
  return activeCount > 0;
}

/**
 * Declarative guard: pass `true` while the sensitive flow is active.
 * Cleans up automatically on unmount, so a user abandoning the page
 * mid-flow releases the guard and normal idle enforcement resumes.
 */
export function useSensitiveFlow(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activeCount += 1;
    return () => {
      activeCount = Math.max(0, activeCount - 1);
    };
  }, [active]);
}
