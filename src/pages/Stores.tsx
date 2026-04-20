import { useEffect, useMemo, useState } from 'react';
import { Header, Screen } from '@/components/layout';
import { EmptyState, Input, Skeleton } from '@/components/ui';
import { FilterIcon, SearchIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { StoreCategory } from '@/lib/data';
import { StoreCard } from '@/components/stores/StoreCard';
import { cn } from '@/lib/cn';

const FILTERS: (StoreCategory | 'all')[] = ['all', 'cars', 'properties', 'equipment', 'other'];

export default function Stores() {
  const t = useT();
  const { locale } = useI18n();
  const { stores } = useStore();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StoreCategory | 'all'>('all');

  useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), 550);
    return () => window.clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
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
  }, [stores, query, category, locale, t]);

  return (
    <>
      <Header title={t('stores.title')} subtitle={t('stores.subtitle')} />
      <Screen>
        <Input
          placeholder={t('stores.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leading={<SearchIcon size={18} />}
          trailing={
            <span className="text-ink-300">
              <FilterIcon size={16} />
            </span>
          }
        />

        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 w-max">
            {FILTERS.map((f) => {
              const active = category === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setCategory(f)}
                  className={cn(
                    'h-8 px-3 rounded-full text-[12.5px] font-semibold ring-1 ring-inset transition-colors whitespace-nowrap',
                    active
                      ? 'bg-ink-900 text-white ring-ink-900'
                      : 'bg-white text-ink-600 ring-ink-100 hover:bg-ink-50',
                  )}
                >
                  {t(`stores.filters.${f}`)}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <StoreCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={22} />}
            title={t('stores.emptySearch')}
            description={t('stores.emptyHint')}
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-[12px]">
              <span className="text-ink-400">
                {t('stores.count', { count: filtered.length })}
              </span>
            </div>
            <div className="space-y-2.5">
              {filtered.map((s) => (
                <StoreCard key={s.id} store={s} />
              ))}
            </div>
          </>
        )}
      </Screen>
    </>
  );
}

function StoreCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl2 bg-white ring-1 ring-ink-100 p-4">
      <Skeleton className="h-14 w-14 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}
