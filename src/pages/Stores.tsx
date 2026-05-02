import { useEffect, useMemo, useState } from 'react';
import { Header, Screen } from '@/components/layout';
import { EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { BadgeCheckIcon, SearchIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { PartnerStore, StoreCategory } from '@/lib/data';
import { StoreCard } from '@/components/stores/StoreCard';
import {
  adaptMerchantToStore,
  listMerchants,
  useSupabaseAuth,
} from '@/lib/supabase';
import { cn } from '@/lib/cn';

const FILTERS: (StoreCategory | 'all')[] = [
  'all',
  'dresses',
  'bags',
  'watches',
  'bishts',
];

type SortKey = 'recommended' | 'rating' | 'branches' | 'name';

export default function Stores() {
  const t = useT();
  const { locale } = useI18n();
  const { stores: demoStores } = useStore();
  const { configured } = useSupabaseAuth();
  const [stores, setStores] = useState<PartnerStore[]>(demoStores);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StoreCategory | 'all'>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('recommended');

  useEffect(() => {
    let cancelled = false;
    if (!configured) {
      setStores(demoStores);
      const id = window.setTimeout(() => setLoading(false), 350);
      return () => window.clearTimeout(id);
    }
    setLoading(true);
    listMerchants()
      .then((rows) => {
        if (cancelled) return;
        setStores(rows.map(adaptMerchantToStore));
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[applux] listMerchants failed; falling back to demo seed', err);
        setStores(demoStores);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, demoStores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = stores.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (verifiedOnly && !s.verified) return false;
      if (!q) return true;
      const name = s.name[locale].toLowerCase();
      const nameAlt = (locale === 'ar' ? s.name.en : s.name.ar).toLowerCase();
      const loc = s.location[locale].toLowerCase();
      const cityLabel = t(`register.cities.${s.city}`).toLowerCase();
      return (
        name.includes(q) ||
        nameAlt.includes(q) ||
        loc.includes(q) ||
        cityLabel.includes(q)
      );
    });
    return sortStores(matched, sort, locale);
  }, [stores, query, category, verifiedOnly, locale, t, sort]);

  const verifiedCount = useMemo(
    () => stores.filter((s) => s.verified).length,
    [stores],
  );

  const filtersActive =
    category !== 'all' || verifiedOnly || query.trim() !== '';

  return (
    <>
      <Header title={t('stores.title')} subtitle={t('stores.subtitle')} />
      <Screen className="bg-canvas">
        <Input
          placeholder={t('stores.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leading={<SearchIcon size={18} />}
          trailing={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('stores.clearSearch')}
                className="text-ink-400 hover:text-ink-700 text-[16px] leading-none"
              >
                ×
              </button>
            ) : null
          }
        />

        <div className="-mx-5 px-5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 w-max">
            {FILTERS.map((f) => {
              const active = category === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setCategory(f)}
                  className={cn(
                    'h-9 px-3.5 rounded-full text-[12.5px] font-medium tracking-tight transition-colors whitespace-nowrap',
                    active
                      ? 'bg-ink-900 text-white shadow-soft'
                      : 'bg-white hairline text-ink-600 hover:bg-canvas-100',
                  )}
                >
                  {t(`stores.filters.${f}`)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={cn(
                'h-9 px-3.5 rounded-full text-[12.5px] font-medium tracking-tight inline-flex items-center gap-1.5 whitespace-nowrap transition-colors',
                verifiedOnly
                  ? 'bg-gold-400 text-ink-950 shadow-soft'
                  : 'bg-white hairline text-gold-700 hover:bg-gold-50',
              )}
              aria-pressed={verifiedOnly}
            >
              <BadgeCheckIcon size={13} />
              {t('stores.verifiedOnly')}
              <span
                className={cn(
                  'num text-[10.5px] font-bold rounded-full h-4 min-w-4 px-1 grid place-items-center',
                  verifiedOnly
                    ? 'bg-ink-950/15 text-ink-950'
                    : 'bg-gold-50 text-gold-700',
                )}
              >
                {verifiedCount}
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <StoreCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-1 text-[12px]">
              <span className="text-ink-500">
                {t('stores.count', { count: filtered.length })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-400 font-medium">
                  {t('stores.sortLabel')}
                </span>
                <Select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-8 w-auto text-[12px] py-0"
                  aria-label={t('stores.sortLabel')}
                >
                  <option value="recommended">
                    {t('stores.sort.recommended')}
                  </option>
                  <option value="rating">{t('stores.sort.rating')}</option>
                  <option value="branches">{t('stores.sort.branches')}</option>
                  <option value="name">{t('stores.sort.name')}</option>
                </Select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={22} />}
                title={t('stores.emptySearch')}
                description={t('stores.emptyHint')}
                action={
                  filtersActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setCategory('all');
                        setVerifiedOnly(false);
                      }}
                      className="text-[12.5px] font-semibold text-gold-700 hover:text-gold-600"
                    >
                      {t('stores.clearFilters')}
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-2.5">
                {filtered.map((s) => (
                  <StoreCard key={s.id} store={s} />
                ))}
              </div>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function sortStores(
  list: PartnerStore[],
  sort: SortKey,
  locale: 'ar' | 'en',
): PartnerStore[] {
  const arr = [...list];
  switch (sort) {
    case 'rating':
      return arr.sort((a, b) => b.rating - a.rating);
    case 'branches':
      return arr.sort((a, b) => b.branches.length - a.branches.length);
    case 'name':
      return arr.sort((a, b) =>
        a.name[locale].localeCompare(b.name[locale], locale),
      );
    case 'recommended':
    default:
      // Verified first, then by rating
      return arr.sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return b.rating - a.rating;
      });
  }
}

function StoreCardSkeleton() {
  return (
    <div className="rounded-xl3 bg-white hairline shadow-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-5 w-16 rounded-full ms-auto" />
      </div>
    </div>
  );
}

