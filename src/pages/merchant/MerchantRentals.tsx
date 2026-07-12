import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import {
  CarIcon,
  ChevronIcon,
  InfoIcon,
} from '@/components/icons';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import { getInitials } from '@/lib/format/initials';
import { rentalStatusTone as toneForStatus } from '@/lib/format/statusTones';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  fetchMyMerchant,
  fetchProfilesByIds,
  listMerchantContracts,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { MerchantRental } from '@/lib/data';
import { cn } from '@/lib/cn';

type Filter = 'all' | 'active' | 'due-soon' | 'overdue';

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all', labelKey: 'merchant.rentals.filterAll' },
  { key: 'active', labelKey: 'merchant.rentals.filterActive' },
  { key: 'due-soon', labelKey: 'merchant.rentals.filterDue' },
  { key: 'overdue', labelKey: 'merchant.rentals.filterOverdue' },
];

export default function MerchantRentals() {
  const t = useT();
  const { dir } = useI18n();
  const { merchantRentals: demoRentals } = useStore();
  const { configured, session } = useSupabaseAuth();
  const [liveRentals, setLiveRentals] = useState<MerchantRental[] | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(
    () => configured && Boolean(session?.user?.id),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get('filter') as Filter | null) ?? 'all';
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.key === initialFilter) ? initialFilter : 'all',
  );

  // Phase 3B: merchant identity comes from the shared memory cache
  // (same key as MerchantHome / the rental-session wizard), so landing
  // here from the dashboard no longer re-resolves it. The rentals list
  // itself stays UNCACHED until Phase 4A wires mutation invalidation —
  // caching it now would show stale rows after close/damage actions.
  const userId = session?.user?.id ?? null;
  const { data: myMerchantData, error: merchantError } = useCachedQuery(
    configured && userId ? cacheKeys.myMerchant(userId) : null,
    () => fetchMyMerchant(userId!),
    { ttlMs: CACHE_TTL.myMerchant, refetchOnFocus: false },
  );
  // undefined = identity still resolving; error resolves it to null so
  // the list settles on empty exactly like the old .catch(() => null).
  const myMerchant = merchantError ? null : myMerchantData;

  useEffect(() => {
    if (!configured || !userId) {
      setLiveRentals(null);
      setLiveLoading(false);
      return;
    }
    if (myMerchant === undefined) {
      setLiveLoading(true); // merchant identity still resolving
      return;
    }
    if (!myMerchant) {
      setLiveRentals([]);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    let cancelled = false;
    (async () => {
      const contractRows = await listMerchantContracts(myMerchant.id).catch(() => []);
      if (cancelled) return;
      const profileMap = await fetchProfilesByIds(
        contractRows.map((c) => c.customer_user_id),
      ).catch(() => new Map<string, never>());
      if (cancelled) return;
      setLiveRentals(
        contractRows.map((r) => {
          const customer = profileMap.get(r.customer_user_id);
          const name = customer?.full_name ?? '—';
          const initials = getInitials(name);
          return adaptContractToMerchantRental(r, {
            category: myMerchant.primary_category,
            customerName: name,
            customerInitials: initials,
            customerCity: customer?.city ?? '',
            customerMobile: customer?.mobile ?? '',
            headlineItem: `Rental ${r.contract_number}`,
          });
        }),
      );
      if (!cancelled) setLiveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, userId, myMerchant]);

  const merchantRentals = liveRentals ?? demoRentals;

  const filtered = useMemo(() => {
    if (filter === 'all') return merchantRentals;
    return merchantRentals.filter((r) => r.status === filter);
  }, [filter, merchantRentals]);

  const onFilter = (next: Filter) => {
    setFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    setSearchParams(params, { replace: true });
  };

  if (configured && liveLoading) {
    return (
      <>
        <Header title={t('merchant.rentals.title')} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-5 pt-4 pb-10">
            <PageSkeleton rows={4} />
          </div>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Header
        title={t('merchant.rentals.title')}
        subtitle={t('merchant.rentals.count', { count: filtered.length })}
        showBack
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-4 pb-10 space-y-4">
          <div
            className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1"
            role="tablist"
          >
            {FILTERS.map((f) => {
              const active = f.key === filter;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => onFilter(f.key)}
                  className={cn(
                    'h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors ring-1 ring-inset',
                    active
                      ? 'bg-ink-900 text-white ring-ink-900'
                      : 'bg-white text-ink-600 hairline',
                  )}
                >
                  {t(f.labelKey)}
                </button>
              );
            })}
          </div>

          <SectionHeader title={t('merchant.rentals.subtitle')} />

          {filtered.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('merchant.rentals.empty')}
              description={t('merchant.rentals.emptyHint')}
            />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((r) => (
                <RentalCard key={r.id} rental={r} dir={dir} />
              ))}
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}


function rentalPeriodDays(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
}

function RentalCard({ rental, dir }: { rental: MerchantRental; dir: 'rtl' | 'ltr' }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const tone = toneForStatus(rental.status);
  const days = rentalPeriodDays(rental.startDate, rental.endDate);
  return (
    <Link to={`/merchant/rentals/${rental.id}`} className="block">
    <Card padded interactive className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
          <CarIcon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-ink-900 truncate">
            {rental.customerName}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-400 truncate">
            {rental.item}
          </div>
        </div>
        <StatusChip
          size="sm"
          tone={tone}
          dot
          label={t(`merchant.rentals.status.${rental.status}`)}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11.5px]">
        <div>
          <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
            {t('merchant.rentals.rentalFee')}
          </div>
          <div className="mt-0.5 font-semibold text-ink-900 num">
            {formatCurrency(rental.monthlyAmount)}
          </div>
        </div>
        <div>
          <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
            {t('merchant.rentals.returnDate')}
          </div>
          <div className="mt-0.5 font-semibold text-ink-900 num">
            {formatDate(rental.endDate)}
          </div>
        </div>
        <div className="text-end">
          <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
            {rental.id}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-500">
            {t('merchant.rentals.rentalPeriod', { count: days })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end text-[11.5px] text-ink-400">
        <ChevronIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
      </div>
    </Card>
    </Link>
  );
}
