import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { Header } from '@/components/layout';
import { PageSkeleton, StatusChip, type StatusTone } from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import { MerchantTabBar } from '@/components/merchant/MerchantTabBar';
import {
  BadgeCheckIcon,
  GavelIcon,
  HistoryIcon,
  PlusIcon,
} from '@/components/icons';
import { getInitials } from '@/lib/format/initials';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { MerchantRental } from '@/lib/data';
import {
  adaptContractToMerchantRental,
  fetchMyMerchant,
  fetchProfilesByIds,
  listMerchantContracts,
  listMerchantInvoices,
  useSupabaseAuth,
  type MerchantRow,
} from '@/lib/supabase';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import { resolveMerchantName } from '@/lib/merchantName';
import { withTimeout } from '@/lib/withTimeout';

// Per-query timeouts so a single slow Supabase round-trip can't park
// the dashboard on a spinner indefinitely.
const MERCHANT_IDENTITY_TIMEOUT_MS = 8_000;
const MERCHANT_DATA_TIMEOUT_MS = 12_000;

// =====================================================================
// Merchant dashboard — design M09.
// =====================================================================
// Compact in-body masthead (store name over "لوحة المتجر" + verified
// chip), a 2×2 stat-tile grid, the primary green issue CTA, and the
// "يحتاج انتباهك" feed. Sign-out + release line/diagnostics moved to
// MerchantProfile (M16) in design D1 — the dashboard no longer
// duplicates them.
//
// Stat derivations (all from the queries this page already ran):
//   * active rentals    — adapted contracts with status ≠ returned
//                         (same definition the old overview tile used)
//   * awaiting review   — issued invoices count (demo: approvals queue)
//   * returns this week — non-returned contracts with end_date within
//                         the next 7 days (client-side date math only)
//   * open damage cases — demo damage store entries not settled (live
//                         damage lists load on /merchant/damages; the
//                         dashboard never fetched them and still
//                         doesn't — no new queries in a design phase)
// =====================================================================

export default function MerchantHome() {
  const t = useT();
  const { locale, formatDate } = useI18n();
  const navigate = useNavigate();
  const {
    merchant,
    merchantRentals: demoRentals,
    merchantApprovals,
    merchantDamages,
  } = useStore();
  const supabaseAuth = useSupabaseAuth();

  // ---------- Data fetching (two stages) ----------
  // Stage 1 (Phase 3B): own merchant identity reads through the memory
  // cache (15-min TTL) — MerchantRentals and the rental-session wizard
  // share the same key, so hopping between merchant screens no longer
  // re-resolves the identity every mount. No focus refetch: the row is
  // stable for the session and the second-stage fetch below keys off
  // its object identity, so an unnecessary rewrite would re-trigger
  // the whole dashboard load.
  const userId = supabaseAuth.session?.user?.id ?? null;
  const {
    data: myMerchantData,
    loading: merchantLoading,
    error: merchantError,
  } = useCachedQuery<MerchantRow | null>(
    userId ? cacheKeys.myMerchant(userId) : null,
    () =>
      withTimeout(
        fetchMyMerchant(userId!),
        MERCHANT_IDENTITY_TIMEOUT_MS,
        'fetchMyMerchant',
      ),
    { ttlMs: CACHE_TTL.myMerchant, refetchOnFocus: false },
  );
  // Error → null, matching the previous setLiveMerchant(null) path
  // (dashboard renders the unknown-merchant fallback).
  const liveMerchant: MerchantRow | null = myMerchantData ?? null;
  useEffect(() => {
    if (merchantError) {
      logEvent('rpc_failure', 'warn', { op: 'fetch_my_merchant' }, merchantError);
    }
  }, [merchantError]);

  const [liveRentals, setLiveRentals] = useState<MerchantRental[] | null>(null);

  // Stage 2 (Phase 4A): both merchant lists read through the memory
  // cache — 2-min TTL + focus refetch. The keys are invalidated by
  // invoice creation (invoices) and close/damage (contracts), so
  // returning to the dashboard after those actions shows fresh counts
  // immediately. MerchantRentals shares merchant:{uid}:contracts.
  // Errors map to empty lists, matching the previous .catch(() => []).
  const merchantId = liveMerchant?.id ?? null;
  const { data: contractRowsData, error: contractsError } = useCachedQuery(
    userId && merchantId ? cacheKeys.merchantContracts(userId) : null,
    () =>
      withTimeout(
        listMerchantContracts(merchantId!),
        MERCHANT_DATA_TIMEOUT_MS,
        'listMerchantContracts',
      ),
    { ttlMs: CACHE_TTL.merchantLists, refetchOnFocus: true },
  );
  const { data: issuedInvoicesData, error: invoicesError } = useCachedQuery(
    userId && merchantId ? cacheKeys.merchantInvoices(userId, 'issued') : null,
    () =>
      withTimeout(
        listMerchantInvoices(merchantId!, { status: 'issued' }),
        MERCHANT_DATA_TIMEOUT_MS,
        'listMerchantInvoices',
      ),
    { ttlMs: CACHE_TTL.merchantLists, refetchOnFocus: true },
  );
  useEffect(() => {
    if (contractsError) {
      logEvent('rpc_failure', 'warn', { op: 'list_merchant_contracts' }, contractsError);
    }
    if (invoicesError) {
      logEvent('rpc_failure', 'warn', { op: 'list_merchant_invoices' }, invoicesError);
    }
  }, [contractsError, invoicesError]);
  const contractRows = contractsError ? [] : contractRowsData;
  const issuedInvoices = invoicesError ? [] : issuedInvoicesData;
  const livePendingInvoices = invoicesError
    ? 0
    : (issuedInvoicesData?.length ?? null);

  // Stage 3: customer display names. DELIBERATELY UNCACHED — the
  // profile rows include national_id (Phase 3B sensitivity ruling);
  // one live batch query per dashboard load is the accepted cost.
  useEffect(() => {
    if (!supabaseAuth.configured || !liveMerchant) return;
    if (contractRows === undefined) return; // contracts list still resolving
    let cancelled = false;
    (async () => {
      const profileMap = await withTimeout(
        fetchProfilesByIds(contractRows.map((c) => c.customer_user_id)),
        MERCHANT_DATA_TIMEOUT_MS,
        'fetchProfilesByIds',
      ).catch((err) => {
        logEvent('rpc_failure', 'warn', { op: 'fetch_profiles_by_ids' }, err);
        return new Map<string, never>();
      });
      if (cancelled) return;
      setLiveRentals(
        contractRows.map((r) => {
          const customer = profileMap.get(r.customer_user_id);
          const name = customer?.full_name ?? '—';
          const initials = getInitials(name);
          return adaptContractToMerchantRental(r, {
            category: liveMerchant.primary_category,
            customerName: name,
            customerInitials: initials,
            customerCity: customer?.city ?? '',
            customerMobile: customer?.mobile ?? '',
            headlineItem: `Rental ${r.contract_number}`,
          });
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseAuth.configured, liveMerchant, contractRows]);

  // Phase 9 skeleton gate, now derived: lists resolving OR the first
  // profile join not yet landed (liveRentals stays populated across
  // focus revalidations, so refreshes never flash the skeleton).
  const dataLoading =
    supabaseAuth.configured && Boolean(liveMerchant)
      ? contractRows === undefined ||
        livePendingInvoices === null ||
        liveRentals === null
      : false;

  const merchantRentals = liveRentals ?? demoRentals;

  useEffect(() => {
    if (supabaseAuth.configured) return;
    if (!merchant) {
      navigate('/merchant/welcome', { replace: true });
      return;
    }
    if (merchant.status === 'pending') {
      navigate('/merchant/pending', { replace: true });
    }
  }, [supabaseAuth.configured, merchant, navigate]);

  // ---------- Derived counts (see header comment for definitions) ----------
  const overdueCount = useMemo(
    () => merchantRentals.filter((r) => r.status === 'overdue').length,
    [merchantRentals],
  );
  const activeCount = useMemo(
    () => merchantRentals.filter((r) => r.status !== 'returned').length,
    [merchantRentals],
  );
  const pendingCount = livePendingInvoices ?? merchantApprovals.length;
  const openDamageCount = useMemo(
    () => merchantDamages.filter((d) => d.status !== 'settled').length,
    [merchantDamages],
  );
  // Returns due within the next 7 days (still out, end date upcoming).
  const dueWeekCount = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 86_400_000;
    return merchantRentals.filter((r) => {
      if (r.status === 'returned') return false;
      const end = new Date(r.endDate).getTime();
      return !Number.isNaN(end) && end >= now && end <= week;
    }).length;
  }, [merchantRentals]);

  // ---------- Attention feed ----------
  // Only legitimate, already-loaded actionable states: overdue rentals,
  // issued offers awaiting the customer, upcoming returns, and (demo)
  // open damage cases. Capped at five rows — the full lists are one tap
  // away on their own screens.
  type FeedItem = {
    key: string;
    title: string;
    chipLabel: string;
    chipTone: StatusTone;
    meta: ReactNode;
    to: string;
  };
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const r of merchantRentals.filter((x) => x.status === 'overdue')) {
      items.push({
        key: `overdue-${r.id}`,
        title: r.customerName,
        chipLabel: t('merchant.rentals.status.overdue'),
        chipTone: 'danger',
        meta: (
          <>
            {t('merchant.home.feed.overdueSince', { date: formatDate(r.endDate) })}
            {' · '}
            <span dir="ltr" className="num">{r.contractRef}</span>
          </>
        ),
        to: `/merchant/rentals/${r.id}`,
      });
    }
    if (supabaseAuth.configured) {
      for (const inv of issuedInvoices ?? []) {
        items.push({
          key: `inv-${inv.id}`,
          title: t('merchant.home.feed.offerTitle', { ref: inv.invoice_number }),
          chipLabel: t('journey.stages.review'),
          chipTone: 'warn',
          meta: (
            <>
              {t('merchant.home.feed.sentAt', {
                date: formatDate(inv.issued_at ?? inv.created_at),
              })}
              {' · '}
              <span dir="ltr" className="num">{inv.invoice_number}</span>
            </>
          ),
          to: '/merchant/approvals',
        });
      }
    } else {
      for (const a of merchantApprovals) {
        items.push({
          key: `appr-${a.id}`,
          title: `${a.item} — ${a.customerName}`,
          chipLabel: t('journey.stages.review'),
          chipTone: 'warn',
          meta: (
            <>
              {t('merchant.home.feed.sentAt', { date: formatDate(a.submittedAt) })}
              {' · '}
              <span dir="ltr" className="num">{a.id}</span>
            </>
          ),
          to: '/merchant/approvals',
        });
      }
    }
    for (const r of merchantRentals.filter((x) => x.status === 'due-soon')) {
      items.push({
        key: `due-${r.id}`,
        title: r.customerName,
        chipLabel: t('merchant.rentals.status.due-soon'),
        chipTone: 'success',
        meta: (
          <>
            {t('merchant.home.feed.dueOn', { date: formatDate(r.endDate) })}
            {' · '}
            <span dir="ltr" className="num">{r.contractRef}</span>
          </>
        ),
        to: `/merchant/rentals/${r.id}`,
      });
    }
    if (openDamageCount > 0) {
      items.push({
        key: 'damages',
        title: t('merchant.home.feed.damageTitle', { count: openDamageCount }),
        chipLabel: t('merchant.home.feed.damageChip'),
        chipTone: 'danger',
        meta: t('merchant.home.damageAlertHint'),
        to: '/merchant/damages',
      });
    }
    return items.slice(0, 5);
  }, [
    merchantRentals,
    issuedInvoices,
    merchantApprovals,
    openDamageCount,
    supabaseAuth.configured,
    t,
    formatDate,
  ]);

  // ---------- Pre-render gate (demo only) ----------
  if (!supabaseAuth.configured && !merchant) return null;

  // Phase 9 — in live mode show a skeleton while the merchant identity
  // or the rentals/pending invoices fetches are in flight. Without this
  // the dashboard would briefly show zeroed counts (now that seed data
  // is gated behind demoMode) before the real numbers arrive.
  if (supabaseAuth.configured && (merchantLoading || dataLoading)) {
    return (
      <>
        <Header title={t('merchant.home.heading')} />
        <Screen className="bg-beige-100">
          <PageSkeleton rows={4} />
        </Screen>
        <MerchantTabBar />
      </>
    );
  }

  const companyName = supabaseAuth.configured
    ? liveMerchant
      ? resolveMerchantName(liveMerchant, locale, t('merchant.home.unknownMerchant'))
      : t('merchant.home.unknownMerchant')
    : merchant?.companyName ?? '';
  const verified = supabaseAuth.configured ? Boolean(liveMerchant?.verified) : true;

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24 space-y-3">
          {/* ====== M09 masthead ====== */}
          <div className="flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink-500 truncate">{companyName}</div>
              <h1 className="text-[19px] font-bold text-navy-700 leading-tight">
                {t('merchant.home.heading')}
              </h1>
            </div>
            <LangToggle compact />
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-3 py-1.5 text-[11px] font-bold shrink-0">
                <BadgeCheckIcon size={11} />
                {t('merchant.profile.verified')}
              </span>
            )}
          </div>

          {/* ====== Stat tiles (2×2) ====== */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <StatTile value={activeCount} label={t('merchant.home.stats.active')} />
            <StatTile
              value={pendingCount}
              label={t('merchant.home.stats.review')}
              valueClass="text-warn-600"
            />
            <StatTile value={dueWeekCount} label={t('merchant.home.stats.dueWeek')} />
            <StatTile
              value={openDamageCount}
              label={t('merchant.home.stats.damage')}
              valueClass="text-danger-600"
            />
          </div>

          {/* ====== Primary issue CTA ====== */}
          <Link
            to="/merchant/session/new"
            className="flex items-center justify-center gap-2 h-13 w-full rounded-xl2 bg-green-500 text-white font-bold text-[14.5px] shadow-soft hover:bg-green-600 active:bg-green-600 transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985] select-none"
          >
            <PlusIcon size={15} strokeWidth={2.5} />
            {t('merchant.home.issueCta')}
          </Link>

          {/* ====== Attention feed ====== */}
          <div className="text-[14px] font-bold text-navy-700 pt-1.5">
            {t('merchant.home.attentionTitle')}
          </div>
          {feed.length === 0 ? (
            <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 text-[12.5px] text-ink-500 leading-relaxed">
              {t('merchant.home.attentionEmpty')}
            </div>
          ) : (
            feed.map((item) => (
              <Link key={item.key} to={item.to} className="block">
                <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-[15px] space-y-2 transition-transform active:scale-[0.995]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-bold text-ink-900 truncate">
                      {item.title}
                    </span>
                    <StatusChip size="sm" tone={item.chipTone} dot={false} label={item.chipLabel} />
                  </div>
                  <div className="text-[12px] text-ink-500 truncate">{item.meta}</div>
                </div>
              </Link>
            ))
          )}

          {/* ====== Secondary destinations (kept reachable: the design
                     nav has no damages/history tab) ====== */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Link
              to="/merchant/damages"
              className="flex items-center justify-center gap-2 h-11 rounded-xl2 bg-white ring-1 ring-beige-200 text-[12.5px] font-bold text-navy-700 hover:bg-beige-50 transition-colors"
            >
              <GavelIcon size={14} />
              {t('merchant.home.quickDamages')}
            </Link>
            <Link
              to="/merchant/history"
              className="flex items-center justify-center gap-2 h-11 rounded-xl2 bg-white ring-1 ring-beige-200 text-[12.5px] font-bold text-navy-700 hover:bg-beige-50 transition-colors"
            >
              <HistoryIcon size={14} />
              {t('merchant.home.quickHistory')}
            </Link>
          </div>
        </div>
      </Screen>
      <MerchantTabBar />
    </>
  );
}

// =====================================================================
// Pieces
// =====================================================================

function StatTile({
  value,
  label,
  valueClass,
}: {
  value: number;
  label: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-4 py-[15px]">
      <div
        className={`text-[24px] font-bold leading-none num ${valueClass ?? 'text-navy-700'}`}
        dir="ltr"
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-ink-500 leading-snug">{label}</div>
    </div>
  );
}
