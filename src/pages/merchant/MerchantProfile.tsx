import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, PageSkeleton, StatusChip } from '@/components/ui';
import {
  BadgeCheckIcon,
  BuildingIcon,
  ChevronIcon,
  SupportIcon,
  UserIcon,
} from '@/components/icons';
import { MerchantTabBar } from '@/components/merchant/MerchantTabBar';
import { getInitials } from '@/lib/format/initials';
import { logEvent } from '@/lib/observability/log';
import { releaseInfo } from '@/lib/releaseInfo';
import { useTapReveal } from '@/lib/useTapReveal';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import {
  fetchMyMerchant,
  listMerchantBranches,
  useSupabaseAuth,
} from '@/lib/supabase';
import { resolveMerchantName } from '@/lib/merchantName';

// =====================================================================
// MerchantProfile — design M16 ("حسابي" tab). Store identity card,
// business info rows, representative, support, sign-out, and the
// release line (seven taps open /diagnostics — same gesture as the
// customer profile). Reads the own-merchant row through the existing
// 3B cache key; the branch count is one cheap owner-scoped read.
// Reachable only by ACTIVE merchants (operational route guard).
// =====================================================================

const SUPPORT_URL =
  (import.meta.env.VITE_SUPPORT_URL as string | undefined)?.trim() || '';
const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || '';

export default function MerchantProfile() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const supabaseAuth = useSupabaseAuth();
  const { configured, profile, session } = supabaseAuth;
  const { merchant: demoMerchant, signOutMerchant } = useStore();
  const tapVersion = useTapReveal(() => navigate('/diagnostics'));

  const userId = session?.user?.id ?? null;
  const { data: liveMerchant, loading: merchantLoading } = useCachedQuery(
    configured && userId ? cacheKeys.myMerchant(userId) : null,
    () => fetchMyMerchant(userId!),
    { ttlMs: CACHE_TTL.myMerchant },
  );

  const [branchCount, setBranchCount] = useState<number | null>(null);
  useEffect(() => {
    if (!configured || !liveMerchant?.id) return;
    let cancelled = false;
    listMerchantBranches(liveMerchant.id)
      .then((rows) => {
        if (!cancelled) setBranchCount(rows.length);
      })
      .catch((err) => {
        logEvent('rpc_failure', 'warn', { op: 'list_merchant_branches' }, err);
        if (!cancelled) setBranchCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, liveMerchant?.id]);

  const handleSignOut = async () => {
    if (configured) {
      try {
        await supabaseAuth.signOut();
      } catch (err) {
        logEvent('rpc_failure', 'warn', { op: 'merchant_sign_out' }, err);
      }
    }
    signOutMerchant();
    navigate('/merchant/welcome', { replace: true });
  };

  // Unified view: live merchant row or the demo store equivalent.
  const name = configured
    ? liveMerchant
      ? resolveMerchantName(liveMerchant, locale, '—')
      : '—'
    : demoMerchant?.companyName ?? '—';
  const cr = configured
    ? liveMerchant?.commercial_reg_number ?? '—'
    : demoMerchant?.commercialReg ?? '—';
  const categoryKey = configured ? liveMerchant?.primary_category : 'dress';
  const categoryLabel = categoryKey
    ? t(`merchant.register.categories.${categoryKey}`)
    : '—';
  const verified = configured ? Boolean(liveMerchant?.verified) : true;
  const activeStatus = configured ? liveMerchant?.status === 'active' : true;
  const repName = configured
    ? profile?.full_name ?? '—'
    : demoMerchant?.authorizedName ?? '—';
  const branchesLabel = configured
    ? branchCount === null
      ? '—'
      : t('merchant.home.branchesCount', { count: branchCount })
    : t('merchant.home.branchesCount', { count: demoMerchant?.branches.length ?? 0 });

  if (configured && merchantLoading) {
    return (
      <>
        <Header title={t('merchant.profile.title')} />
        <Screen padded={false} className="bg-beige-100">
          <div className="px-5 pt-5 pb-24">
            <PageSkeleton rows={4} />
          </div>
        </Screen>
        <MerchantTabBar />
      </>
    );
  }

  return (
    <>
      <Header title={t('merchant.profile.title')} />
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-5 pb-24 space-y-4">
          {/* Store identity — M16 header */}
          <div className="flex items-center gap-3.5">
            <span className="h-14 w-14 shrink-0 rounded-full bg-green-50 text-green-700 grid place-items-center text-[19px] font-bold">
              {getInitials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-bold text-navy-700 truncate">
                {name}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-500 truncate">
                {categoryLabel} ·{' '}
                <span className="num" dir="ltr">
                  {cr}
                </span>
              </div>
            </div>
            {verified && (
              <StatusChip
                size="sm"
                tone="success"
                dot={false}
                label={
                  <span className="inline-flex items-center gap-1">
                    <BadgeCheckIcon size={10} />
                    {t('merchant.profile.verified')}
                  </span>
                }
              />
            )}
          </div>

          {/* Business info rows */}
          <Card padded={false} className="overflow-hidden">
            <Row
              icon={<BuildingIcon size={16} />}
              label={t('merchant.profile.activity')}
              value={categoryLabel}
            />
            <Divider />
            <Row
              icon={<BuildingIcon size={16} />}
              label={t('merchant.profile.branches')}
              value={branchesLabel}
            />
            <Divider />
            <Row
              icon={<BadgeCheckIcon size={16} />}
              label={t('merchant.profile.accountStatus')}
              value={
                activeStatus
                  ? t('merchant.profile.activeVerified')
                  : t('merchant.profile.inactive')
              }
              valueClassName={activeStatus ? 'text-green-700 font-bold' : undefined}
            />
          </Card>

          {/* Representative + support */}
          <Card padded={false} className="overflow-hidden">
            <Row
              icon={<UserIcon size={16} />}
              label={t('merchant.profile.representative')}
              value={repName}
            />
            {(SUPPORT_URL || SUPPORT_EMAIL) && (
              <>
                <Divider />
                <button
                  type="button"
                  onClick={() => {
                    const target = SUPPORT_URL || `mailto:${SUPPORT_EMAIL}`;
                    window.open(target, '_blank', 'noopener');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-beige-50 transition-colors"
                >
                  <span className="h-9 w-9 rounded-xl bg-navy-50 text-navy-700 grid place-items-center shrink-0">
                    <SupportIcon size={16} />
                  </span>
                  <span className="flex-1 text-[13.5px] font-semibold text-ink-800">
                    {t('merchant.profile.support')}
                  </span>
                  <ChevronIcon size={14} className="text-ink-300 rtl:rotate-0 ltr:rotate-180" />
                </button>
              </>
            )}
          </Card>

          <Button variant="secondary" block onClick={() => void handleSignOut()}>
            {t('merchant.pending.signOut')}
          </Button>

          {/* Release line — seven taps open /diagnostics. Real release
              data only (version · commit · environment). */}
          <button
            type="button"
            onClick={tapVersion}
            className="w-full text-center text-[11px] text-ink-400 num cursor-default select-none"
            dir="ltr"
          >
            Lend · {releaseInfo.version} · {releaseInfo.commit} · {releaseInfo.env}
          </button>
        </div>
      </Screen>
      <MerchantTabBar />
    </>
  );
}

function Row({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="h-9 w-9 rounded-xl bg-beige-200/60 text-navy-700 grid place-items-center shrink-0">
        {icon}
      </span>
      <span className="flex-1 text-[13.5px] font-semibold text-ink-800">{label}</span>
      <span className={cn('text-[12.5px] text-ink-500', valueClassName)}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-beige-200 mx-4" />;
}
