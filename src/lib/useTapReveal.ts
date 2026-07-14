import { useCallback, useRef } from 'react';

// =====================================================================
// useTapReveal — Phase 6C. Hidden-surface access gesture: N taps on an
// innocuous element (the version row) within a rolling window trigger
// the reveal callback. No state is persisted; a pause resets the count.
// =====================================================================

export function useTapReveal(
  onReveal: () => void,
  taps = 7,
  windowMs = 2_500,
): () => void {
  const countRef = useRef(0);
  const lastTapRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current > windowMs) countRef.current = 0;
    lastTapRef.current = now;
    countRef.current += 1;
    if (countRef.current >= taps) {
      countRef.current = 0;
      onReveal();
    }
  }, [onReveal, taps, windowMs]);
}
