import { useCallback, useRef, useState } from 'react';

// =====================================================================
// useAvailability — the shared async field-validation primitive for
// onboarding (email, Unified Number, …). One consistent behavior:
//   * cache per normalized value (blur + Next don't re-probe the same
//     value; the Next tap is never swallowed because the button isn't
//     disabled on `checking`)
//   * latest request wins: a stale in-flight probe never flips `checking`
//     for a newer value
//   * network/RPC failure → 'error' (never cached, so it retries)
//   * demo/undefined check → treated as 'ok'
//
// Callers guard against a stale RESULT overwriting a newer field value by
// comparing the field's current value with the probed value before
// applying an error (see MerchantRegister blur handlers).
// =====================================================================

export type Verdict = 'ok' | 'taken' | 'error';

export function useAvailability(
  check: ((value: string) => Promise<boolean>) | null,
  normalize: (raw: string) => string = (x) => x.trim(),
) {
  const cache = useRef(new Map<string, Verdict>());
  const inflight = useRef(0);
  const [checking, setChecking] = useState(false);

  const probe = useCallback(
    async (raw: string): Promise<Verdict> => {
      const key = normalize(raw);
      const cached = cache.current.get(key);
      if (cached && cached !== 'error') return cached;
      if (!check) return 'ok'; // demo / no backend
      const token = ++inflight.current;
      setChecking(true);
      try {
        const ok = await check(key);
        const verdict: Verdict = ok ? 'ok' : 'taken';
        cache.current.set(key, verdict);
        return verdict;
      } catch {
        return 'error';
      } finally {
        if (token === inflight.current) setChecking(false);
      }
    },
    [check, normalize],
  );

  /** Force the next probe of this value to hit the server (used before a
   *  final-submit race re-check). */
  const invalidate = useCallback(
    (raw: string) => {
      cache.current.delete(normalize(raw));
    },
    [normalize],
  );

  return { probe, checking, invalidate };
}
