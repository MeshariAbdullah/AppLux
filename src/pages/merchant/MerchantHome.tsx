import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  PageSkeleton,
  SectionHeader,
} from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  AlertIcon,
  ChevronIcon,
  ClockIcon,
  GavelIcon,
  HistoryIcon,
  PackageIcon,
  ReceiptIcon,
  SparkleIcon,
} from '@/components/icons';
import { getInitials } from '@/lib/format/initials';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';
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
import { withTimeout } from '@/lib/withTimeout';

// Per-query timeouts so a single slow Supabase round-trip can't park
// the dashboard on a spinner indefinitely.
const MERCHANT_IDENTITY_TIMEOUT_MS = 8_000;
const MERCHANT_DATA_TIMEOUT_MS = 12_000;

// =====================================================================
// Merchant dashboard — action hub layout.
// =====================================================================
// Three sections, in priority order:
//   1. Action Required (conditional)  — overdue / pending / damage
//   2. Quick Actions   (always shown) — start session, contracts, …
//   3. Overview        (always shown) — three compact stat tiles
//
// What this layout deliberately does NOT show:
//   * a big dark "operations" hero with a revenue figure
//   * a 4-tile 2×2 summary block that duplicates the quick actions
//   * a "Recent activity" feed (the merchant has a full /merchant/rentals
//     list one tap away)
//   * an "Issue rental invoice" quick action (redundant with the
//     "Start rental session" flow, which is the same operation)
//
// All state-driven items move into Action Required when they need
// attention. Navigation lives in Quick Actions. At-a-glance counts
// live in Overview.
// =====================================================================

export default function MerchantHome() {
  const t = useT();
  const { dir } = useI18n();
  const navigate = useNavigate();
  const {
    merchant,
    signOutMerchant,
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
      // eslint-disable-next-line no-console
      console.error('[lend] fetchMyMerchant failed', merchantError);
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
      // eslint-disable-next-line no-console
      console.error('[lend] listMerchantContracts failed', contractsError);
    }
    if (invoicesError) {
      // eslint-disable-next-line no-console
      console.error('[lend] listMerchantInvoices failed', invoicesError);
    }
  }, [contractsError, invoicesError]);
  const contractRows = contractsError ? [] : contractRowsData;
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
        // eslint-disable-next-line no-console
        console.error('[lend] fetchProfilesByIds failed', err);
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

  // ---------- Derived counts ----------
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

  // ---------- Pre-render gate (demo only) ----------
  if (!supabaseAuth.configured && !merchant) return null;

  // Phase 9 — in live mode show a skeleton while the merchant identity
  // or the rentals/pending invoices fetches are in flight. Without this
  // the dashboard would briefly show zeroed counts (now that seed data
  // is gated behind demoMode) before the real numbers arrive.
  if (supabaseAuth.configured && (merchantLoading || dataLoading)) {
    return (
      <>
        <Header title={t('merchant.home.title')} />
        <Screen className="bg-canvas">
          <PageSkeleton rows={4} />
        </Screen>
      </>
    );
  }

  const companyName = supabaseAuth.configured
    ? liveMerchant?.company_name ?? (merchantLoading ? '…' : t('merchant.home.unknownMerchant'))
    : merchant?.companyName ?? '';

  // ---------- Quick actions ----------
  // Four entries only. Pending approvals deliberately omitted — it's a
  // state-driven item that lives in Action Required when count > 0.
  const quickActions: QuickAction[] = [
    {
      title: t('merchant.home.startSession'),
      desc: t('merchant.home.startSessionDesc'),
      icon: <SparkleIcon size={18} />,
      to: '/merchant/session/new',
      featured: true,
    },
    {
      title: t('merchant.home.quickRentals'),
      desc: t('merchant.home.quickRentalsDesc'),
      icon: <PackageIcon size={18} />,
      to: '/merchant/rentals',
    },
    {
      title: t('merchant.home.quickDamages'),
      desc: t('merchant.home.quickDamagesDesc'),
      icon: <GavelIcon size={18} />,
      to: '/merchant/damages',
    },
    {
      title: t('merchant.home.quickHistory'),
      desc: t('merchant.home.quickHistoryDesc'),
      icon: <HistoryIcon size={18} />,
      to: '/merchant/history',
    },
  ];

  const hasActionRequired =
    overdueCount > 0 || pendingCount > 0 || openDamageCount > 0;

  return (
    <>
      <Header
        title={t('merchant.home.title')}
        trailing={<LangToggle tone="dark" />}
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* ====== GREETING (compact, replaces big hero) ====== */}
          <GreetingStrip
            greeting={t('merchant.home.welcome', { name: companyName })}
            subtitle={t('merchant.home.subtitle')}
          />

          {/* ====== ACTION REQUIRED (conditional) ====== */}
          {hasActionRequired && (
            <section>
              <SectionHeader title={t('merchant.home.alertsTitle')} />
              <div className="space-y-2.5">
                {pendingCount > 0 && (
                  <AlertRow
                    tone="warn"
                    icon={<ReceiptIcon size={16} />}
                    title={t('merchant.home.approvalsAlert', { count: pendingCount })}
                    hint={t('merchant.home.approvalsAlertHint')}
                    to="/merchant/approvals"
                    cta={t('merchant.home.viewAlert')}
                    dir={dir}
                  />
                )}
                {overdueCount > 0 && (
                  <AlertRow
                    tone="danger"
                    icon={<ClockIcon size={16} />}
                    title={t('merchant.home.overdueAlert', { count: overdueCount })}
                    hint={t('merchant.home.overdueAlertHint')}
                    to="/merchant/rentals?filter=overdue"
                    cta={t('merchant.home.viewAlert')}
                    dir={dir}
                  />
                )}
                {openDamageCount > 0 && (
                  <AlertRow
                    tone="warn"
                    icon={<AlertIcon size={16} />}
                    title={t('merchant.home.damageAlert', { count: openDamageCount })}
                    hint={t('merchant.home.damageAlertHint')}
                    to="/merchant/damages"
                    cta={t('merchant.home.viewAlert')}
                    dir={dir}
                  />
                )}
              </div>
            </section>
          )}

          {/* ====== QUICK ACTIONS ====== */}
          <section>
            <SectionHeader title={t('merchant.home.quickActionsTitle')} />
            <div className="space-y-2.5">
              {quickActions.map((a) => (
                <Link key={a.to} to={a.to} className="block">
                  <Card
                    padded
                    interactive
                    className={cn(
                      'flex items-center gap-3',
                      a.featured &&
                        'bg-gradient-to-br from-lavender-300 via-lavender-400 to-lavender-500 ring-0 shadow-plush',
                    )}
                  >
                    <span
                      className={cn(
                        'h-10 w-10 shrink-0 rounded-xl grid place-items-center ring-1 ring-inset',
                        a.featured
                          ? 'bg-white/15 text-white ring-white/20'
                          : 'bg-canvas-100 text-ink-700 hairline',
                      )}
                    >
                      {a.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          'text-[13.5px] font-semibold truncate',
                          a.featured ? 'text-white' : 'text-ink-900',
                        )}
                      >
                        {a.title}
                      </div>
                      <div
                        className={cn(
                          'mt-0.5 text-[12px] leading-relaxed truncate',
                          a.featured ? 'text-white/75' : 'text-ink-400',
                        )}
                      >
                        {a.desc}
                      </div>
                    </div>
                    <ChevronIcon
                      size={16}
                      className={cn(
                        'shrink-0',
                        a.featured ? 'text-white/75' : 'text-ink-300',
                        dir === 'rtl' ? 'rotate-180' : '',
                      )}
                    />
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {/* ====== OVERVIEW (three compact tiles) ====== */}
          <section>
            <SectionHeader title={t('merchant.home.summaryTitle')} />
            <div className="grid grid-cols-3 gap-2.5">
              <OverviewTile
                label={t('merchant.home.summaryActive')}
                value={activeCount}
              />
              <OverviewTile
                label={t('merchant.home.summaryPending')}
                value={pendingCount}
              />
              <OverviewTile
                label={t('merchant.home.summaryDamages')}
                value={openDamageCount}
              />
            </div>
          </section>

          {/* ====== SIGN OUT ====== */}
          <div className="pt-2">
            <Button
              variant="secondary"
              block
              onClick={async () => {
                if (supabaseAuth.configured) {
                  try {
                    await supabaseAuth.signOut();
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[lend] merchant signOut failed', err);
                  }
                }
                signOutMerchant();
                navigate('/merchant/welcome', { replace: true });
              }}
            >
              {t('merchant.home.signOut')}
            </Button>
          </div>
        </div>
      </Screen>
    </>
  );
}

// =====================================================================
// Pieces
// =====================================================================

function GreetingStrip({
  greeting,
  subtitle,
}: {
  greeting: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl3 bg-white hairline shadow-soft px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="h-1.5 w-6 rounded-full bg-lavender-400 shrink-0" aria-hidden />
        <h1 className="editorial-title text-[20px] text-ink-900 leading-tight truncate">
          {greeting}
        </h1>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed ps-9">
        {subtitle}
      </p>
    </div>
  );
}

type QuickAction = {
  title: string;
  desc: string;
  icon: ReactNode;
  to: string;
  featured?: boolean;
};

type AlertRowProps = {
  tone: 'danger' | 'warn';
  icon: ReactNode;
  title: ReactNode;
  hint: ReactNode;
  cta: ReactNode;
  to: string;
  dir: 'rtl' | 'ltr';
};

function AlertRow({ tone, icon, title, hint, cta, to, dir }: AlertRowProps) {
  const skin =
    tone === 'danger'
      ? 'bg-danger-50 ring-danger-500/25 text-danger-700'
      : 'bg-warn-50 ring-warn-500/25 text-warn-700';
  const iconSkin =
    tone === 'danger' ? 'bg-danger-500/10 text-danger-600' : 'bg-warn-500/10 text-warn-600';
  return (
    <Link to={to} className="block">
      <div
        className={cn(
          'rounded-xl2 ring-1 ring-inset px-3.5 py-3 flex items-center gap-3 transition-transform active:scale-[0.995]',
          skin,
        )}
      >
        <span
          className={cn(
            'h-9 w-9 shrink-0 rounded-xl grid place-items-center',
            iconSkin,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold truncate">{title}</div>
          <div className="mt-0.5 text-[11.5px] opacity-80 truncate">{hint}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[12px] font-semibold">
          {cta}
          <ChevronIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
        </div>
      </div>
    </Link>
  );
}

function OverviewTile({
  label,
  value,
}: {
  label: ReactNode;
  value: number;
}) {
  return (
    <div className="rounded-xl2 bg-white hairline px-3 py-3 shadow-soft">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400 truncate">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-bold text-ink-900 num leading-none">
        {value}
      </div>
    </div>
  );
}
