import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { MerchantTabBar } from '@/components/merchant/MerchantTabBar';
import { EmptyState, Input, PageSkeleton, StatusChip } from '@/components/ui';
import { InfoIcon, SearchIcon } from '@/components/icons';
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
  listMerchantInvoices,
  useSupabaseAuth,
  type RentalInvoiceRow,
} from '@/lib/supabase';
import type { MerchantRental } from '@/lib/data';
import { cn } from '@/lib/cn';

// =====================================================================
// Merchant rentals — design M12.
// =====================================================================
// Approved primary filters: الكل / مراجعة العميل / نشط / متأخر, each
// with a live count chip from the loaded dataset. "مراجعة العميل" rows
// are the ISSUED invoices (offers awaiting the customer) — the same
// cached read the dashboard uses (merchant:{uid}:invoices:issued), so
// no new query semantics. قريب الاستحقاق stays a CARD-level chip under
// the نشط filter, per the approved vocabulary. Search filters the
// loaded rows client-side by customer or reference.
// =====================================================================

type Filter = 'all' | 'review' | 'active' | 'overdue';

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all', labelKey: 'merchant.rentals.filterAll' },
  { key: 'review', labelKey: 'merchant.rentals.filterReview' },
  { key: 'active', labelKey: 'merchant.rentals.filterActive' },
  { key: 'overdue', labelKey: 'merchant.rentals.filterOverdue' },
];

/** Awaiting-customer-review row (issued invoice / demo approval). */
type ReviewEntry = {
  id: string;
  ref: string;
  customerName: string;
  amount: number;
  startsAt: string | null;
};

export default function MerchantRentals() {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const { merchantRentals: demoRentals, merchantApprovals } = useStore();
  const { configured, session } = useSupabaseAuth();
  const [liveRentals, setLiveRentals] = useState<MerchantRental[] | null>(null);
  const [liveReviewRows, setLiveReviewRows] = useState<ReviewEntry[] | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(
    () => configured && Boolean(session?.user?.id),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get('filter') as Filter | null) ?? 'all';
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.key === initialFilter) ? initialFilter : 'all',
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Phase 3B: merchant identity comes from the shared memory cache
  // (same key as MerchantHome / the rental-session wizard), so landing
  // here from the dashboard no longer re-resolves it.
  const userId = session?.user?.id ?? null;
  const { data: myMerchantData, error: merchantError } = useCachedQuery(
    configured && userId ? cacheKeys.myMerchant(userId) : null,
    () => fetchMyMerchant(userId!),
    { ttlMs: CACHE_TTL.myMerchant, refetchOnFocus: false },
  );
  // undefined = identity still resolving; error resolves it to null so
  // the list settles on empty exactly like the old .catch(() => null).
  const myMerchant = merchantError ? null : myMerchantData;

  // Phase 4A: the contracts list reads through the memory cache —
  // 2-min TTL + focus refetch, SAME key MerchantHome uses, and
  // invalidated by close/damage mutations so returning here after
  // closing a rental shows the closed state immediately. Errors map
  // to an empty list like the old .catch(() => []).
  const { data: contractRowsData, error: contractsError } = useCachedQuery(
    configured && userId && myMerchant
      ? cacheKeys.merchantContracts(userId)
      : null,
    () => listMerchantContracts(myMerchant!.id),
    { ttlMs: CACHE_TTL.merchantLists, refetchOnFocus: true },
  );
  const contractRows = contractsError ? [] : contractRowsData;

  // M12: issued invoices ("مراجعة العميل" rows) — SAME cache key, TTL
  // and invalidation the dashboard already uses for this list.
  const { data: invoiceRowsData, error: invoicesError } = useCachedQuery(
    configured && userId && myMerchant
      ? cacheKeys.merchantInvoices(userId, 'issued')
      : null,
    () => listMerchantInvoices(myMerchant!.id, { status: 'issued' }),
    { ttlMs: CACHE_TTL.merchantLists, refetchOnFocus: true },
  );
  const invoiceRows = invoicesError ? [] : invoiceRowsData;

  useEffect(() => {
    if (!configured || !userId) {
      setLiveRentals(null);
      setLiveReviewRows(null);
      setLiveLoading(false);
      return;
    }
    if (myMerchant === undefined) {
      setLiveLoading(true); // merchant identity still resolving
      return;
    }
    if (!myMerchant) {
      setLiveRentals([]);
      setLiveReviewRows([]);
      setLiveLoading(false);
      return;
    }
    if (contractRows === undefined || invoiceRows === undefined) {
      setLiveLoading(true); // lists still resolving
      return;
    }
    setLiveLoading(true);
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      // One batch: contract customers + invoice customers (the page
      // already made this live profile read for contracts).
      const customerIds = [
        ...contractRows.map((c) => c.customer_user_id),
        ...invoiceRows.map((i: RentalInvoiceRow) => i.customer_user_id),
      ];
      const profileMap = await fetchProfilesByIds(customerIds).catch(
        () => new Map<string, never>(),
      );
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
      setLiveReviewRows(
        invoiceRows.map((i: RentalInvoiceRow) => ({
          id: i.id,
          ref: i.invoice_number,
          customerName: profileMap.get(i.customer_user_id)?.full_name ?? '—',
          amount: Number(i.total_amount),
          startsAt: i.starts_at ?? null,
        })),
      );
      if (!cancelled) setLiveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, userId, myMerchant, contractRows, invoiceRows]);

  const merchantRentals = liveRentals ?? demoRentals;
  const reviewRows: ReviewEntry[] = configured
    ? liveReviewRows ?? []
    : merchantApprovals.map((a) => ({
        id: a.id,
        ref: a.id,
        customerName: a.customerName,
        amount: a.amount,
        startsAt: null,
      }));

  // ---- counts from the loaded dataset ----
  const counts: Record<Filter, number> = useMemo(() => {
    const overdue = merchantRentals.filter((r) => r.status === 'overdue').length;
    const active = merchantRentals.filter(
      (r) => r.status === 'active' || r.status === 'due-soon',
    ).length;
    return {
      all: merchantRentals.length + reviewRows.length,
      review: reviewRows.length,
      active,
      overdue,
    };
  }, [merchantRentals, reviewRows]);

  const q = query.trim().toLowerCase();
  const matches = (...fields: string[]) =>
    !q || fields.some((f) => f.toLowerCase().includes(q));

  const filteredRentals = useMemo(() => {
    const base =
      filter === 'all'
        ? merchantRentals
        : filter === 'active'
          ? merchantRentals.filter(
              (r) => r.status === 'active' || r.status === 'due-soon',
            )
          : filter === 'overdue'
            ? merchantRentals.filter((r) => r.status === 'overdue')
            : [];
    return base.filter((r) => matches(r.customerName, r.id, r.item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, merchantRentals, q]);

  const filteredReviews = useMemo(() => {
    const base = filter === 'all' || filter === 'review' ? reviewRows : [];
    return base.filter((r) => matches(r.customerName, r.ref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, reviewRows, q]);

  const totalShown = filteredRentals.length + filteredReviews.length;

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
        <Screen padded={false} className="bg-beige-100">
          <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24">
            <PageSkeleton rows={4} />
          </div>
        </Screen>
        <MerchantTabBar />
      </>
    );
  }

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24 space-y-3">
          {/* ====== M12 masthead: title + search toggle ====== */}
          <div className="flex items-center gap-2.5">
            <h1 className="flex-1 text-[19px] font-bold text-navy-700">
              {t('merchant.rentals.title')}
            </h1>
            <button
              type="button"
              onClick={() => {
                setSearchOpen((s) => !s);
                if (searchOpen) setQuery('');
              }}
              aria-label={t('merchant.rentals.searchPlaceholder')}
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
              placeholder={t('merchant.rentals.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          {/* ====== Filter chips with live counts ====== */}
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
                  role="tab"
                  aria-selected={active}
                  onClick={() => onFilter(f.key)}
                  className={cn(
                    'h-9 px-4 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-navy-700 text-white'
                      : 'bg-white text-ink-700 ring-1 ring-beige-200',
                  )}
                >
                  {t(f.labelKey)}{' '}
                  <span dir="ltr" className="num">
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {totalShown === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('merchant.rentals.empty')}
              description={t('merchant.rentals.emptyHint')}
            />
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((r) => (
                <ReviewCard key={r.id} entry={r} formatCurrency={formatCurrency} formatDate={formatDate} />
              ))}
              {filteredRentals.map((r) => (
                <RentalCard key={r.id} rental={r} />
              ))}
            </div>
          )}
        </div>
      </Screen>
      <MerchantTabBar />
    </>
  );
}

// ---------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------

/** Issued offer awaiting the customer — taps through to the approvals
 *  queue (there is no contract yet to open). */
function ReviewCard({
  entry,
  formatCurrency,
  formatDate,
}: {
  entry: ReviewEntry;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
}) {
  const t = useT();
  return (
    <Link to="/merchant/approvals" className="block">
      <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 space-y-2 transition-transform active:scale-[0.995]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-bold text-ink-900 truncate">
            {entry.customerName}
          </span>
          <StatusChip
            size="sm"
            tone="warn"
            dot={false}
            label={t('merchant.rentals.filterReview')}
          />
        </div>
        <div className="text-[12.5px] text-ink-500 truncate">
          <span dir="ltr" className="num">{entry.ref}</span>
          {' · '}
          <span className="num">{formatCurrency(entry.amount)}</span>
          {entry.startsAt && (
            <>
              {' · '}
              {t('merchant.rentals.reviewStart', { date: formatDate(entry.startsAt) })}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function rentalPeriodDays(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
}

function RentalCard({ rental }: { rental: MerchantRental }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const tone = toneForStatus(rental.status);
  const days = rentalPeriodDays(rental.startDate, rental.endDate);
  const returned = rental.status === 'returned';
  return (
    <Link to={`/merchant/rentals/${rental.id}`} className="block">
      <div
        className={cn(
          'rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 space-y-2 transition-transform active:scale-[0.995]',
          returned && 'opacity-85',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-bold text-ink-900 truncate">
            {rental.customerName}
          </span>
          {/* قريب الاستحقاق renders here as a card-level chip — it is
              deliberately NOT a primary filter (approved vocabulary). */}
          <StatusChip
            size="sm"
            tone={tone}
            dot={false}
            label={t(`merchant.rentals.status.${rental.status}`)}
          />
        </div>
        <div className="text-[12.5px] text-ink-500 truncate">
          <span dir="ltr" className="num">{rental.contractRef}</span>
          {' · '}
          <span className="num">{formatCurrency(rental.monthlyAmount)}</span>
          {' · '}
          {rental.status === 'overdue'
            ? t('merchant.home.feed.overdueSince', { date: formatDate(rental.endDate) })
            : t('merchant.home.feed.dueOn', { date: formatDate(rental.endDate) })}
          {' · '}
          {t('merchant.rentals.rentalPeriod', { count: days })}
        </div>
      </div>
    </Link>
  );
}
