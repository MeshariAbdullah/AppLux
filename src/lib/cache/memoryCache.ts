// =====================================================================
// memoryCache — Phase 3A cache primitive. MEMORY ONLY, by design:
// nothing here ever touches localStorage/sessionStorage, so cached
// rows (which can include names, mobiles, admin PII) live exactly as
// long as the JS context and are wiped by cacheClearAll() on sign-out.
//
// Deliberately dependency-free (no React, no supabase imports) so it
// can be wired into the auth layer without cycles and smoke-tested in
// plain Node.
//
// Concepts:
//   * Entry      — { value, storedAt }. Freshness is a READ-side
//                  decision (caller passes its TTL), so one key can be
//                  "fresh enough" for one surface and stale for another.
//   * Epoch      — per-key version counter. invalidate() bumps it;
//                  any fetch started under an older epoch is discarded
//                  on resolve instead of resurrecting stale data
//                  (same idea as the auth provider's loadIdRef).
//   * Dedupe     — concurrent cacheFetch() calls for the same key+epoch
//                  share one in-flight promise (kills StrictMode
//                  double-fetch and sibling-component duplicate loads).
//   * LRU cap    — Map insertion order is recency order (reads re-insert);
//                  past MAX_ENTRIES the oldest entry is evicted.
//   * Subscribe  — useCachedQuery re-renders on writes/invalidations.
//
// No page consumes this yet (Phase 3B/4 wire it up) — importing this
// module changes zero product behavior.
// =====================================================================

export type CacheReadResult<T> = {
  value: T;
  /** Milliseconds since the value was stored — callers compare
   *  against their TTL to decide fresh / stale-but-usable. */
  ageMs: number;
};

type Entry = {
  value: unknown;
  storedAt: number;
};

type Inflight = {
  epoch: number;
  promise: Promise<unknown>;
};

/** Hard ceiling on entries. The app's whole key space is a few dozen
 *  keys; this is insurance against a pathological caller looping over
 *  parameterised keys during a long-lived iOS session. */
const MAX_ENTRIES = 100;

const store = new Map<string, Entry>();
const epochs = new Map<string, number>();
const inflight = new Map<string, Inflight>();
const subscribers = new Map<string, Set<() => void>>();

function epochOf(key: string): number {
  return epochs.get(key) ?? 0;
}

function notify(key: string): void {
  const subs = subscribers.get(key);
  if (!subs) return;
  for (const cb of subs) cb();
}

/** Read a value with its age. Returns undefined when absent. Reading
 *  refreshes LRU recency. Never throws. */
export function cacheRead<T>(key: string): CacheReadResult<T> | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  // Re-insert to mark as most-recently-used.
  store.delete(key);
  store.set(key, entry);
  return { value: entry.value as T, ageMs: Date.now() - entry.storedAt };
}

/** Store a value under the CURRENT epoch and notify subscribers. */
export function cacheWrite<T>(key: string, value: T): void {
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    // Evict least-recently-used — first key in insertion order.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.delete(key);
  store.set(key, { value, storedAt: Date.now() });
  notify(key);
}

/** Drop one key and bump its epoch so in-flight fetches for the old
 *  epoch are discarded on resolve. */
export function cacheInvalidate(key: string): void {
  store.delete(key);
  inflight.delete(key);
  epochs.set(key, epochOf(key) + 1);
  notify(key);
}

/** Prefix invalidation — e.g. `merchant:{uid}:` after a merchant
 *  mutation. Bumps epochs for every known key under the prefix
 *  (stored, in-flight, or previously invalidated). */
export function cacheInvalidatePrefix(prefix: string): void {
  const keys = new Set<string>();
  for (const k of store.keys()) if (k.startsWith(prefix)) keys.add(k);
  for (const k of inflight.keys()) if (k.startsWith(prefix)) keys.add(k);
  for (const k of epochs.keys()) if (k.startsWith(prefix)) keys.add(k);
  for (const k of subscribers.keys()) if (k.startsWith(prefix)) keys.add(k);
  for (const k of keys) cacheInvalidate(k);
}

/** Wipe everything — called on SIGNED_OUT / sign-out so no entry can
 *  outlive its user. Epochs are bumped for every known key so any
 *  fetch still in flight for the previous user is discarded. */
export function cacheClearAll(): void {
  const known = new Set<string>([
    ...store.keys(),
    ...inflight.keys(),
    ...epochs.keys(),
  ]);
  store.clear();
  inflight.clear();
  for (const k of known) epochs.set(k, epochOf(k) + 1);
  for (const subs of subscribers.values()) for (const cb of subs) cb();
}

/**
 * Fetch-through: dedupes concurrent calls per key and writes the
 * result ONLY if the key's epoch is unchanged when the fetch resolves
 * — an invalidation (or clearAll) during flight wins over the stale
 * response. Errors propagate to every awaiting caller and are not
 * cached.
 */
export function cacheFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const startEpoch = epochOf(key);
  const existing = inflight.get(key);
  if (existing && existing.epoch === startEpoch) {
    return existing.promise as Promise<T>;
  }

  const promise = fetcher().then(
    (value) => {
      if (epochOf(key) === startEpoch) {
        cacheWrite(key, value);
        if (inflight.get(key)?.promise === promise) inflight.delete(key);
      }
      return value;
    },
    (err) => {
      if (inflight.get(key)?.promise === promise) inflight.delete(key);
      throw err;
    },
  );

  inflight.set(key, { epoch: startEpoch, promise });
  return promise;
}

/**
 * Read-through fetch for IMPERATIVE call sites (Phase 4A) — the rental
 * detail pages resolve `contract → merchant/note` inside async effect
 * chains where a hook per entity doesn't fit. Fresh-within-TTL resolves
 * the cached value with zero network; stale/missing goes through
 * cacheFetch (keeping in-flight dedupe and the epoch guard).
 *
 * Demo-mode note: every current caller sits inside a
 * `supabaseAuth.configured` guard, so this never runs in demo mode;
 * the fetchers themselves would throw via requireSupabase() otherwise.
 */
export function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cacheRead<T>(key);
  if (hit && hit.ageMs < ttlMs) return Promise.resolve(hit.value);
  return cacheFetch(key, fetcher);
}

/** Subscribe to writes/invalidations of one key. Returns unsubscribe. */
export function cacheSubscribe(key: string, cb: () => void): () => void {
  let subs = subscribers.get(key);
  if (!subs) {
    subs = new Set();
    subscribers.set(key, subs);
  }
  subs.add(cb);
  return () => {
    subs.delete(cb);
    if (subs.size === 0) subscribers.delete(key);
  };
}

/** Diagnostics for smoke checks — not for product code. */
export function cacheStats(): { entries: number; inflight: number } {
  return { entries: store.size, inflight: inflight.size };
}
