import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { supabaseConfigured } from '@/lib/supabase/client';
import { FOCUS_REVALIDATE_MIN_MS } from './keys';
import {
  cacheFetch,
  cacheRead,
  cacheSubscribe,
  markCacheOutcome,
} from './memoryCache';

// =====================================================================
// useCachedQuery — Phase 3A SWR-style read hook. NOT consumed by any
// page yet; Phase 3B/4 opt pages in one at a time.
//
// Semantics (approved plan, decision #2 — stale-while-revalidate):
//   * cached + fresh (age < ttl)  → serve instantly, no network
//   * cached + stale              → serve instantly, revalidate in
//                                   background, re-render on arrival
//   * missing                     → loading=true, fetch, render result
//
// Gates:
//   * `enabled: false` or `key: null` → hook is inert.
//   * DEMO MODE BYPASS is enforced HERE, centrally: when Supabase env
//     is not configured the hook never activates, so the demo store
//     remains the only data path in demo builds — the Phase 9 class
//     of demo/live bleed bugs cannot re-enter through the cache.
//
// Errors: a failed revalidation keeps serving the cached value and
// surfaces `error` alongside it; only a failure with NO cached value
// leaves data undefined. Errors are never cached.
//
// Sign-out: cacheClearAll() (wired in the auth layer) notifies every
// subscriber, so mounted consumers drop to `undefined` immediately —
// no previous-user rows can linger on screen.
// =====================================================================

export type CachedQueryResult<T> = {
  data: T | undefined;
  /** True only while fetching with NOTHING cached to show. */
  loading: boolean;
  /** True while a background revalidation is in flight (data visible). */
  refreshing: boolean;
  error: Error | null;
  /** Force a revalidation now (ignores TTL). */
  refresh: () => void;
};

export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: {
    ttlMs: number;
    enabled?: boolean;
    /** Revalidate when the app returns to the foreground (list keys). */
    refetchOnFocus?: boolean;
  },
): CachedQueryResult<T> {
  const active = Boolean(key) && opts.enabled !== false && supabaseConfigured;

  // Bumped by cache writes/invalidations for this key → re-render and
  // re-read from the store.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Latest fetcher without making it an effect dependency — callers
  // pass inline closures.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cached = active && key ? cacheRead<T>(key) : undefined;

  const revalidate = useCallback(
    (currentKey: string) => {
      const hasValue = cacheRead(currentKey) !== undefined;
      if (hasValue) setRefreshing(true);
      else setLoading(true);
      cacheFetch(currentKey, fetcherRef.current as () => Promise<unknown>)
        .then(() => setError(null))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [],
  );

  // Subscribe to store changes for this key.
  useEffect(() => {
    if (!active || !key) return;
    return cacheSubscribe(key, bump);
  }, [active, key]);

  // Mount / key change: SWR decision.
  useEffect(() => {
    if (!active || !key) {
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    const entry = cacheRead<T>(key);
    markCacheOutcome(Boolean(entry && entry.ageMs < opts.ttlMs));
    if (!entry || entry.ageMs >= opts.ttlMs) {
      revalidate(key);
    }
    // Fresh entry → nothing to do; render already served it.
    // opts.ttlMs is a constant from CACHE_TTL per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, revalidate]);

  // Foreground revalidation for list-type keys.
  useEffect(() => {
    if (!active || !key || !opts.refetchOnFocus) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const entry = cacheRead<T>(key);
      // Floor prevents app-switcher flapping from hammering the backend.
      if (!entry || entry.ageMs >= FOCUS_REVALIDATE_MIN_MS) revalidate(key);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, opts.refetchOnFocus, revalidate]);

  const refresh = useCallback(() => {
    if (active && key) revalidate(key);
  }, [active, key, revalidate]);

  return {
    data: cached?.value,
    loading: active ? loading && cached === undefined : false,
    refreshing,
    error,
    refresh,
  };
}
