import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { EmptyState, Input, Skeleton } from '@/components/ui';
import { InfoIcon, SearchIcon } from '@/components/icons';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { PartnerStore, StoreCategory } from '@/lib/data';
import {
  adaptMerchantToStore,
  listActivitiesForMerchants,
  listMerchants,
  useSupabaseAuth,
} from '@/lib/supabase';
import { StoreCard } from '@/components/stores/StoreCard';
import { cn } from '@/lib/cn';

// =====================================================================
// Stores — customer design C06 (approved Conflict-2 decision).
// The browsable store LIST: title, search, the approved category chips
// (الكل / فساتين / حقائب / ساعات / بشوت) and real partner cards that
// open the existing /stores/:id details route.
//
// Data is UNCHANGED from the sectors era: the same single cached
// listMerchants() read (publicMerchants key, 15-min TTL, no focus
// refetch). Search + category filtering are client-side over the
// already-loaded rows. src/lib/sectors.ts stays untouched for other
// consumers.
// =====================================================================

type Filter = 'all' | StoreCategory;

const FILTERS: Filter[] = ['all', 'dresses', 'bags', 'watches', 'bishts'];

export default function Stores() {
  const t = useT();
  const { locale } = useI18n();
  const { stores: demoStores } = useStore();
  const { configured } = useSupabaseAuth();
  // Home's category grid deep-links /stores?filter=<category>; the
  // param seeds the client-side chip state only (no data change).
  const [searchParams] = useSearchParams();
  const initialFilter = (searchParams.get('filter') as Filter | null) ?? 'all';
  const [filter, setFilter] = useState<Filter>(
    FILTERS.includes(initialFilter) ? initialFilter : 'all',
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Phase 3B: the partner list reads through the memory cache — 15-min
  // TTL, no focus refetch (public display data). Revisiting the page
  // within the TTL serves the cached rows instantly with zero network.
  // The hook is inert in demo mode, so the demo path below is the same
  // synchronous store read it always was.
  const {
    data: liveRows,
    loading: liveLoading,
    error: liveError,
  } = useCachedQuery(cacheKeys.publicMerchants(), () => listMerchants(), {
    ttlMs: CACHE_TTL.storeList,
    refetchOnFocus: false,
  });

  useEffect(() => {
    if (liveError) {
      logEvent('rpc_failure', 'warn', { op: 'list_merchants' }, liveError);
    }
  }, [liveError]);

  // Batched activities for all listed merchants, so the category filter
  // matches a store when ANY of its activities matches (not just the
  // primary). One IN() query; the list renders without waiting on it.
  const [activityMap, setActivityMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!configured || !liveRows || liveRows.length === 0) return;
    let cancelled = false;
    listActivitiesForMerchants(liveRows.map((r) => r.id))
      .then((m) => {
        if (!cancelled) setActivityMap(m);
      })
      .catch((err: unknown) => logEvent('rpc_failure', 'warn', { op: 'list_merchant_activities_batch' }, err));
    return () => {
      cancelled = true;
    };
  }, [configured, liveRows]);

  // Demo-mode visual parity: the brief skeleton beat the page always had.
  const [demoSettled, setDemoSettled] = useState(configured);
  useEffect(() => {
    if (configured) return;
    const id = window.setTimeout(() => setDemoSettled(true), 250);
    return () => window.clearTimeout(id);
  }, [configured]);

  const stores = useMemo<PartnerStore[]>(() => {
    if (!configured) return demoStores;
    // Phase 9 rule preserved: never fall back to demo seeds in live
    // mode. Error or pre-load renders as an empty list behind the
    // skeleton.
    return (liveRows ?? []).map((r) =>
      adaptMerchantToStore(r, {
        activities: (activityMap[r.id] as never) ?? undefined,
      }),
    );
  }, [configured, demoStores, liveRows, activityMap]);

  const loading = configured ? liveLoading : !demoSettled;

  // Client-side filtering over the loaded rows only.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    let rows = stores;
    if (filter !== 'all')
      rows = rows.filter((s) =>
        (s.activities && s.activities.length ? s.activities : [s.category]).includes(filter),
      );
    if (q) {
      rows = rows.filter((s) => {
        const name = (s.name[locale] || s.name.ar || '').toLowerCase();
        const city = t(`register.cities.${s.city}`).toLowerCase();
        return name.includes(q) || city.includes(q);
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, filter, q, locale]);

  return (
    <Screen padded={false} className="bg-beige-100">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24 space-y-3">
        {/* ====== C06 masthead: title + search toggle ====== */}
        <div className="flex items-center gap-2.5">
          <h1 className="flex-1 text-[19px] font-bold text-navy-700">
            {t('stores.title')}
          </h1>
          <button
            type="button"
            onClick={() => {
              setSearchOpen((s) => !s);
              if (searchOpen) setQuery('');
            }}
            aria-label={t('stores.searchPlaceholder')}
            aria-pressed={searchOpen}
            className={cn(
              'h-10 w-10 grid place-items-center rounded-xl bg-white text-navy-700 transition-colors',
              searchOpen
                ? 'ring-[1.5px] ring-green-500'
                : 'ring-[1.5px] ring-beige-300 hover:ring-navy-200',
            )}
          >
            <SearchIcon size={15} />
          </button>
        </div>

        {searchOpen && (
          <Input
            autoFocus
            placeholder={t('stores.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {/* ====== Approved category chips ====== */}
        <div
          className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1"
          role="tablist"
        >
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-9 px-4 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'bg-navy-700 text-white'
                    : 'bg-white text-ink-700 ring-1 ring-beige-200',
                )}
              >
                {t(`stores.filters.${f}`)}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <StoreSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<InfoIcon size={22} />}
            title={t('stores.emptySearch')}
            description={t('stores.emptyHint')}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}

function StoreSkeleton() {
  return (
    <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}
