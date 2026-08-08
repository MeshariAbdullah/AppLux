import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  ProgressBar,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  demoMode,
  listAllDamageCases,
  useSupabaseAuth,
  type DamageCaseRow,
} from '@/lib/supabase';
import { adminPhaseLabelKey, adminPhaseTone } from './AdminCases';
import {
  AlertIcon,
  BadgeCheckIcon,
  BuildingIcon,
  ChartIcon,
  ChevronIcon,
  ClockIcon,
  GavelIcon,
  HistoryIcon,
  InfoIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
  SupportIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import {
  caseSeverityTone as severityTone,
  caseStageTone as stageTone,
  overdueBucketTone as bucketTone,
} from '@/lib/format/statusTones';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import {
  SEED_ADMIN_LIMITS,
  SEED_ADMIN_MERCHANTS,
  SEED_ADMIN_PENDING_MERCHANTS,
  SEED_ADMIN_USERS,
  type AdminActiveCase,
  type AdminOverdueBucket,
  type AdminOverdueCase,
  type AdminPendingMerchant,
} from '@/lib/data';


export default function AdminHome() {
  const t = useT();
  const { formatCurrency, formatDate, formatNumber, dir } = useI18n();
  const navigate = useNavigate();
  const { configured, signOut } = useSupabaseAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /**
   * Admin sign-out — mirrors the customer (Profile.tsx) and merchant
   * (MerchantHome.tsx) patterns. Clears the Supabase session first
   * when configured so a refresh after logout does NOT re-hydrate the
   * admin straight back into /admin/home. In demo mode the navigate
   * is enough on its own (no Supabase session existed).
   */
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      if (configured) {
        await signOut();
      }
      navigate('/welcome', { replace: true });
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'admin_sign_out' }, err);
      setSignOutError(t('admin.home.signOutFailed'));
      setSigningOut(false);
    }
  };

  // Phase 9: SEED_* dashboard inputs are demo data. In live mode this
  // page surfaces zeroed counts until proper Supabase queries are
  // wired; demo mode keeps the original seeded story for screenshots
  // and stakeholder previews. The shape must match each constant's
  // original type — arrays stay arrays, summaries stay typed objects.
  const pendingMerchants = demoMode ? SEED_ADMIN_PENDING_MERCHANTS : [];
  const users = demoMode
    ? SEED_ADMIN_USERS
    : {
        totalUsers: 0,
        verifiedUsers: 0,
        newThisMonth: 0,
        suspended: 0,
        monthlyTrend: 0,
      };
  const merchants = demoMode
    ? SEED_ADMIN_MERCHANTS
    : { totalActive: 0, pending: 0, suspended: 0 };
  const limits = demoMode
    ? SEED_ADMIN_LIMITS
    : {
        totalCap: 0,
        allocated: 0,
        utilization: 0,
        merchantsAtCap: 0,
        pendingRequests: 0,
        avgLimitPerUser: 0,
      };
  // Phase-1 disputes: LIVE case rows (no seed data, no fake overdue
  // model — the legacy overdue widgets were pure demo fiction and are
  // removed). Counters render 0 while loading, never demo rows.
  const [liveCases, setLiveCases] = useState<DamageCaseRow[]>([]);
  useEffect(() => {
    if (!configured) {
      setLiveCases([]);
      return;
    }
    let cancelled = false;
    listAllDamageCases()
      .then((rows) => {
        if (!cancelled) setLiveCases(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [configured]);
  const openCases = useMemo(
    () => liveCases.filter((c) => c.dispute_phase !== 'resolved'),
    [liveCases],
  );
  const activeClaimTotal = useMemo(
    () => openCases.reduce((sum, c) => sum + Number(c.claim_amount), 0),
    [openCases],
  );

  const utilizationPct = Math.round(limits.utilization * 100);
  const remainingCap = limits.totalCap - limits.allocated;

  const quickModules: QuickModule[] = [
    {
      title: t('admin.home.modules.merchants'),
      desc: t('admin.home.modules.merchantsDesc'),
      icon: <BuildingIcon size={18} />,
      to: '/admin/merchants',
      tone: 'bg-canvas-100 text-ink-700 hairline',
      count: merchants.pending,
    },
    {
      title: t('admin.home.modules.users'),
      desc: t('admin.home.modules.usersDesc'),
      icon: <UsersIcon size={18} />,
      to: '/admin/users',
      tone: 'bg-gold-50 text-gold-700 ring-gold-400/30',
    },
    {
      title: t('admin.home.modules.cases'),
      desc: t('admin.home.modules.casesDesc'),
      icon: <GavelIcon size={18} />,
      to: '/admin/cases',
      tone: 'bg-danger-50 text-danger-600 ring-danger-500/20',
      count: openCases.length,
    },
    {
      title: t('admin.home.modules.limits'),
      desc: t('admin.home.modules.limitsDesc'),
      icon: <WalletIcon size={18} />,
      to: '/admin/limits',
      tone: 'bg-canvas-100 text-ink-400 hairline',
      comingSoon: true,
    },
    {
      title: t('admin.home.modules.overdue'),
      desc: t('admin.home.modules.overdueDesc'),
      icon: <ClockIcon size={18} />,
      to: '/admin/overdue',
      tone: 'bg-canvas-100 text-ink-400 hairline',
      comingSoon: true,
    },
    {
      title: t('admin.home.modules.reports'),
      desc: t('admin.home.modules.reportsDesc'),
      icon: <ChartIcon size={18} />,
      to: '/admin/reports',
      tone: 'bg-canvas-100 text-ink-400 hairline',
      comingSoon: true,
    },
    {
      title: t('admin.home.modules.audit'),
      desc: t('admin.home.modules.auditDesc'),
      icon: <HistoryIcon size={18} />,
      to: '/admin/audit',
      tone: 'bg-canvas-100 text-ink-400 hairline',
      comingSoon: true,
    },
    {
      title: t('admin.home.modules.support'),
      desc: t('admin.home.modules.supportDesc'),
      icon: <SupportIcon size={18} />,
      to: '/admin/support',
      tone: 'bg-canvas-100 text-ink-400 hairline',
      comingSoon: true,
    },
  ];

  return (
    <>
      <Header
        title={t('admin.home.title')}
        trailing={<LangToggle tone="dark" />}
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-15%] h-56 w-56 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11.5px] font-semibold text-gold-200">
                  <ShieldIcon size={13} />
                  {t('admin.home.eyebrow')}
                </span>
                <h1 className="mt-4 editorial-title text-[24px] leading-tight truncate text-white">
                  {t('admin.home.welcome')}
                </h1>
                <p className="mt-2 text-[13px] text-white/65 leading-relaxed max-w-[36ch]">
                  {t('admin.home.subtitle')}
                </p>
              </div>
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <ChartIcon size={20} />
              </span>
            </div>

            <div className="relative mt-6 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-3 backdrop-blur grid grid-cols-3 divide-x divide-white/10 rtl:divide-x-reverse">
              <HeroStat
                label={t('admin.home.hero.merchants')}
                value={formatNumber(merchants.totalActive)}
              />
              <HeroStat
                label={t('admin.home.hero.users')}
                value={formatNumber(users.totalUsers)}
              />
              <HeroStat
                label={t('admin.home.hero.cases')}
                value={formatNumber(openCases.length)}
              />
            </div>
          </div>

          {/* Alerts */}
          {pendingMerchants.length > 0 && (
            <section>
              <SectionHeader title={t('admin.home.alerts.title')} />
              <div className="space-y-2.5">
                {pendingMerchants.length > 0 && (
                  <AlertRow
                    tone="brand"
                    icon={<BuildingIcon size={16} />}
                    title={t('admin.home.alerts.merchants', {
                      count: pendingMerchants.length,
                    })}
                    hint={t('admin.home.alerts.merchantsHint')}
                    to="/admin/merchants"
                    cta={t('admin.home.alerts.review')}
                    dir={dir}
                  />
                )}

              </div>
            </section>
          )}

          {/* Summary */}
          <section>
            <SectionHeader title={t('admin.home.summary.title')} />
            <div className="grid grid-cols-2 gap-2.5">
              <SummaryTile
                label={t('admin.home.summary.merchants')}
                value={formatNumber(merchants.totalActive)}
                subValue={t('admin.home.summary.pendingCount', {
                  count: merchants.pending,
                })}
                icon={<BuildingIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
              />
              <SummaryTile
                label={t('admin.home.summary.users')}
                value={formatNumber(users.totalUsers)}
                subValue={t('admin.home.summary.verifiedCount', {
                  count: formatNumber(users.verifiedUsers),
                })}
                icon={<UsersIcon size={16} />}
                tone="bg-gold-50 text-gold-700"
              />
              <SummaryTile
                label={t('admin.home.summary.activeCases')}
                value={formatNumber(openCases.length)}
                subValue={formatCurrency(activeClaimTotal)}
                icon={<GavelIcon size={16} />}
                tone="bg-danger-50 text-danger-600"
                emphasize={openCases.length > 0}
              />
            </div>
          </section>

          {/* Pending merchant approvals */}
          <section>
            <SectionHeader
              title={t('admin.home.approvals.title')}
              action={
                <Link
                  to="/admin/merchants"
                  className="text-[12.5px] font-semibold text-gold-700"
                >
                  {t('common.viewAll')}
                </Link>
              }
            />
            {pendingMerchants.length === 0 ? (
              <Card padded className="text-center">
                <div className="mx-auto h-10 w-10 rounded-xl bg-success-50 text-success-600 grid place-items-center">
                  <BadgeCheckIcon size={18} />
                </div>
                <div className="mt-2 text-[13px] font-semibold text-ink-900">
                  {t('admin.home.approvals.empty')}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-400">
                  {t('admin.home.approvals.emptyHint')}
                </div>
              </Card>
            ) : (
              <Card padded className="space-y-1">
                {pendingMerchants.slice(0, 3).map((m, i) => (
                  <div key={m.id}>
                    <ApprovalRow
                      item={m}
                      dir={dir}
                      formatDate={formatDate}
                      t={t}
                    />
                    {i < Math.min(2, pendingMerchants.length - 1) && (
                      <div className="h-px bg-canvas-200/80" />
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>

          {/* Users overview */}
          <section>
            <SectionHeader title={t('admin.home.users.title')} />
            <Card padded className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
                  <UsersIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-end gap-2">
                    <div className="text-[22px] font-bold text-ink-900 num leading-none">
                      {formatNumber(users.totalUsers)}
                    </div>
                    <div className="text-[12px] font-semibold text-success-600 num pb-1">
                      +{users.monthlyTrend}%
                    </div>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">
                    {t('admin.home.users.totalLabel')}
                  </div>
                </div>
                <Link
                  to="/admin/users"
                  className="shrink-0 text-[12.5px] font-semibold text-gold-700 flex items-center gap-1"
                >
                  {t('common.viewAll')}
                  <ChevronIcon
                    size={12}
                    className={cn(dir === 'rtl' ? 'rotate-180' : '')}
                  />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniMetric
                  label={t('admin.home.users.verified')}
                  value={formatNumber(users.verifiedUsers)}
                  tone="text-success-700"
                />
                <MiniMetric
                  label={t('admin.home.users.newMonth')}
                  value={`+${formatNumber(users.newThisMonth)}`}
                  tone="text-gold-700"
                />
                <MiniMetric
                  label={t('admin.home.users.suspended')}
                  value={formatNumber(users.suspended)}
                  tone="text-danger-600"
                />
              </div>
            </Card>
          </section>

          {/* Rental limits overview */}
          <section>
            <SectionHeader title={t('admin.home.limits.title')} />
            <Card padded className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-success-50 text-success-600 grid place-items-center">
                  <WalletIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">
                      {t('admin.home.limits.allocated')}
                    </div>
                    <div className="num text-[11.5px] font-semibold text-ink-600">
                      {utilizationPct}%
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[18px] font-bold text-ink-900 num leading-none">
                      {formatCurrency(limits.allocated)}
                    </span>
                    <span className="text-[11.5px] text-ink-400 num">
                      / {formatCurrency(limits.totalCap)}
                    </span>
                  </div>
                </div>
              </div>
              <ProgressBar
                value={utilizationPct}
                tone={
                  utilizationPct > 85
                    ? 'danger'
                    : utilizationPct > 70
                      ? 'warn'
                      : 'success'
                }
                size="md"
              />
              <div className="grid grid-cols-3 gap-2">
                <MiniMetric
                  label={t('admin.home.limits.remaining')}
                  value={formatCurrency(remainingCap)}
                  tone="text-ink-900"
                  numeric
                />
                <MiniMetric
                  label={t('admin.home.limits.atCap')}
                  value={formatNumber(limits.merchantsAtCap)}
                  tone="text-warn-600"
                />
                <MiniMetric
                  label={t('admin.home.limits.pending')}
                  value={formatNumber(limits.pendingRequests)}
                  tone="text-gold-700"
                />
              </div>
              <div className="pt-1 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400">
                <ClockIcon size={12} />
                {t('admin.home.limits.comingSoon')}
              </div>
            </Card>
          </section>

          {/* Active cases */}
          <section>
            <SectionHeader
              title={t('admin.home.activeCases.title')}
              action={
                <Link
                  to="/admin/cases"
                  className="text-[12.5px] font-semibold text-gold-700"
                >
                  {t('common.viewAll')}
                </Link>
              }
            />
            <Card padded className="space-y-1">
              {openCases.length === 0 ? (
                <div className="py-2 text-[12.5px] text-ink-500">
                  {t('admin.cases.empty')}
                </div>
              ) : (
                openCases.slice(0, 3).map((c, i) => (
                  <div key={c.id}>
                    <Link
                      to={`/admin/cases/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink-900 num" dir="ltr">
                          {c.case_number}
                        </span>
                        <span className="block text-[11.5px] text-ink-400 num">
                          {formatCurrency(Number(c.claim_amount))}
                        </span>
                      </span>
                      <StatusChip
                        size="sm"
                        tone={adminPhaseTone(c)}
                        dot
                        label={t(adminPhaseLabelKey(c))}
                      />
                    </Link>
                    {i < Math.min(2, openCases.length - 1) && (
                      <div className="h-px bg-canvas-200/80" />
                    )}
                  </div>
                ))
              )}
            </Card>
          </section>

          {/* Quick navigation to modules */}
          <section>
            <SectionHeader title={t('admin.home.modules.title')} />
            <div className="grid grid-cols-2 gap-2.5">
              {quickModules.map((m) => (
                <Link key={m.to} to={m.to} className="block">
                  <Card
                    padded
                    interactive
                    className={cn(
                      'h-full space-y-2.5',
                      m.comingSoon && 'opacity-75',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'h-9 w-9 rounded-xl grid place-items-center ring-1 ring-inset',
                          m.tone,
                        )}
                      >
                        {m.icon}
                      </span>
                      {m.comingSoon ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-canvas-200 text-ink-500 rounded-full px-2 py-0.5">
                          {t('admin.home.modules.comingSoon')}
                        </span>
                      ) : (
                        typeof m.count === 'number' &&
                        m.count > 0 && (
                          <span className="num text-[11px] font-bold bg-ink-900 text-white rounded-full h-5 min-w-5 px-1.5 grid place-items-center">
                            {m.count}
                          </span>
                        )
                      )}
                    </div>
                    <div>
                      <div
                        className={cn(
                          'text-[13px] font-semibold truncate',
                          m.comingSoon ? 'text-ink-600' : 'text-ink-900',
                        )}
                      >
                        {m.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-400 leading-relaxed line-clamp-2">
                        {m.desc}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <div className="rounded-xl2 bg-ink-900 text-white p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white">
              <InfoIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12px] text-white/70 leading-relaxed">
              <div className="text-white font-semibold mb-0.5">
                {t('admin.home.footerNote.title')}
              </div>
              <div>{t('admin.home.footerNote.hint')}</div>
            </div>
          </div>

          {/* Sign out — consistent with Profile.tsx and MerchantHome.tsx.
              In configured mode the Supabase session is cleared first
              so a refresh stays on /welcome and doesn't re-hydrate
              back into /admin/home. */}
          <div className="pt-2 space-y-2">
            <Button
              variant="secondary"
              block
              onClick={() => void handleSignOut()}
              loading={signingOut}
              disabled={signingOut}
            >
              {t('admin.home.signOut')}
            </Button>
            {signOutError && (
              <div
                role="alert"
                className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2 text-[12.5px] text-danger-700"
              >
                {signOutError}
              </div>
            )}
          </div>
        </div>
      </Screen>
    </>
  );
}

type QuickModule = {
  title: string;
  desc: string;
  icon: ReactNode;
  to: string;
  tone: string;
  count?: number;
  comingSoon?: boolean;
};

function HeroStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="px-2 first:ps-1 last:pe-1">
      <div className="text-white/55 uppercase tracking-[0.06em] text-[9.5px] font-medium">
        {label}
      </div>
      <div className="mt-1 editorial-title font-bold text-white num text-[18px] leading-none">
        {value}
      </div>
    </div>
  );
}

function AlertRow({
  tone,
  icon,
  title,
  hint,
  cta,
  to,
  dir,
}: {
  tone: 'danger' | 'warn' | 'brand';
  icon: ReactNode;
  title: ReactNode;
  hint: ReactNode;
  cta: ReactNode;
  to: string;
  dir: 'rtl' | 'ltr';
}) {
  const skin =
    tone === 'danger'
      ? 'bg-danger-50 ring-danger-500/25 text-danger-700'
      : tone === 'warn'
        ? 'bg-warn-50 ring-warn-500/25 text-warn-700'
        : 'bg-gold-50 hairline text-gold-700';
  const iconSkin =
    tone === 'danger'
      ? 'bg-danger-500/10 text-danger-600'
      : tone === 'warn'
        ? 'bg-warn-500/10 text-warn-600'
        : 'bg-gold-50 text-gold-700';
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

function SummaryTile({
  label,
  value,
  subValue,
  icon,
  tone,
  emphasize,
}: {
  label: ReactNode;
  value: ReactNode;
  subValue?: ReactNode;
  icon: ReactNode;
  tone: string;
  emphasize?: boolean;
}) {
  return (
    <Card padded className={cn('space-y-2', emphasize && 'ring-danger-500/20')}>
      <div className={cn('h-8 w-8 rounded-lg grid place-items-center', tone)}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
          {label}
        </div>
        <div className="mt-0.5 text-[22px] font-bold text-ink-900 num leading-none">
          {value}
        </div>
        {subValue && (
          <div className="mt-1 text-[11px] text-ink-500 num truncate">
            {subValue}
          </div>
        )}
      </div>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  tone,
  numeric,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: string;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-xl bg-canvas-100 p-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-[12.5px] font-bold truncate num',
          tone ?? 'text-ink-900',
          numeric && 'text-[12px]',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ApprovalRow({
  item,
  dir,
  formatDate,
  t,
}: {
  item: AdminPendingMerchant;
  dir: 'rtl' | 'ltr';
  formatDate: (d: string | Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <Link
      to={`/admin/merchants/${item.id}`}
      className="flex items-center gap-3 py-2.5 group"
    >
      <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center font-semibold text-[11.5px]">
        {item.initials}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {item.companyName}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
          <span className="truncate">{item.authorizedName}</span>
          <span className="text-ink-300">·</span>
          <span className="num">{item.commercialReg}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusChip
          size="sm"
          tone="warn"
          dot
          label={t('admin.home.approvals.pending')}
        />
        <span className="text-[10.5px] text-ink-400 num">
          {formatDate(item.submittedAt)}
        </span>
      </div>
      <ChevronIcon
        size={14}
        className={cn(
          'text-ink-300 group-hover:text-ink-500 shrink-0',
          dir === 'rtl' ? '' : 'rotate-180',
        )}
      />
    </Link>
  );
}

function CaseRow({
  item,
  formatCurrency,
  t,
  dir,
}: {
  item: AdminActiveCase;
  formatCurrency: (n: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
}) {
  const severe = item.severity !== 'partial';
  return (
    <Link to="/admin/cases" className="flex items-center gap-3 py-2.5 group">
      <span
        className={cn(
          'h-10 w-10 shrink-0 rounded-xl grid place-items-center',
          severe ? 'bg-danger-50 text-danger-600' : 'bg-warn-50 text-warn-600',
        )}
      >
        {item.severity === 'non-return' ? (
          <PackageIcon size={18} />
        ) : severe ? (
          <AlertIcon size={18} />
        ) : (
          <GavelIcon size={18} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {item.customerName}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
          <span className="truncate">{item.merchantName}</span>
          <span className="text-ink-300">·</span>
          <span className="truncate">{item.item}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusChip
            size="sm"
            tone={severityTone(item.severity)}
            dot={false}
            label={t(`merchant.damages.severity.${item.severity}`)}
          />
          <StatusChip
            size="sm"
            tone={stageTone(item.stage)}
            dot
            label={t(`admin.home.activeCases.stage.${item.stage}`)}
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="text-[13px] font-semibold num text-ink-900">
          {formatCurrency(item.claimAmount)}
        </div>
        <ChevronIcon
          size={12}
          className={cn('text-ink-300', dir === 'rtl' ? '' : 'rotate-180')}
        />
      </div>
    </Link>
  );
}

function BucketTile({
  bucket,
  count,
  label,
}: {
  bucket: AdminOverdueBucket;
  count: number;
  label: ReactNode;
}) {
  const tone = bucketTone(bucket);
  const bg =
    tone === 'warn'
      ? 'bg-warn-50 text-warn-700'
      : 'bg-danger-50 text-danger-700';
  return (
    <div className={cn('rounded-xl p-2.5 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="mt-0.5 text-[16px] font-bold num leading-none">
        {count}
      </div>
    </div>
  );
}

function OverdueRow({
  item,
  formatCurrency,
  t,
  dir,
}: {
  item: AdminOverdueCase;
  formatCurrency: (n: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
}) {
  return (
    <Link to="/admin/cases" className="flex items-center gap-3 py-2.5 group">
      <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center font-semibold text-[11.5px]">
        {item.customerInitials}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {item.customerName}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
          <span className="truncate">{item.merchantName}</span>
          <span className="text-ink-300">·</span>
          <ReceiptIcon size={10} />
          <span className="num">{item.id}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="text-[13px] font-semibold num text-ink-900">
          {formatCurrency(item.amount)}
        </div>
        <StatusChip
          size="sm"
          tone={bucketTone(item.bucket)}
          dot
          label={t('admin.home.overdue.daysOverdue', {
            count: item.daysOverdue,
          })}
        />
      </div>
      <ChevronIcon
        size={12}
        className={cn(
          'text-ink-300 shrink-0',
          dir === 'rtl' ? '' : 'rotate-180',
        )}
      />
    </Link>
  );
}
