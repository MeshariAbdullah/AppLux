import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  SectionHeader,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  AlertIcon,
  BadgeCheckIcon,
  CarIcon,
  ChartIcon,
  ChevronIcon,
  ClockIcon,
  GavelIcon,
  HistoryIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { MerchantRental } from '@/lib/data';
import { RentalThumbnail } from '@/components/rental/RentalThumbnail';
import {
  adaptContractToMerchantRental,
  fetchMyMerchant,
  fetchProfilesByIds,
  listMerchantContracts,
  listMerchantInvoices,
  useSupabaseAuth,
} from '@/lib/supabase';

export default function MerchantHome() {
  const t = useT();
  const { formatDate, formatCurrency, dir } = useI18n();
  const navigate = useNavigate();
  const {
    merchant,
    signOutMerchant,
    merchantRentals: demoRentals,
    merchantApprovals,
    merchantDamages,
  } = useStore();
  const supabaseAuth = useSupabaseAuth();
  const [liveRentals, setLiveRentals] = useState<MerchantRental[] | null>(null);
  const [livePendingInvoices, setLivePendingInvoices] = useState<number | null>(null);

  useEffect(() => {
    const userId = supabaseAuth.session?.user?.id;
    if (!supabaseAuth.configured || !userId) {
      setLiveRentals(null);
      setLivePendingInvoices(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const myMerchant = await fetchMyMerchant(userId).catch(() => null);
      if (cancelled || !myMerchant) return;
      const [contractRows, pendingInvoices] = await Promise.all([
        listMerchantContracts(myMerchant.id).catch(() => []),
        listMerchantInvoices(myMerchant.id, { status: 'issued' }).catch(() => []),
      ]);
      if (cancelled) return;
      const profileMap = await fetchProfilesByIds(
        contractRows.map((c) => c.customer_user_id),
      ).catch(() => new Map<string, never>());
      if (cancelled) return;
      setLiveRentals(
        contractRows.map((r) => {
          const customer = profileMap.get(r.customer_user_id);
          const name = customer?.full_name ?? '—';
          const initials =
            name.trim().split(/\s+/).slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('') || '—';
          return adaptContractToMerchantRental(r, {
            category: myMerchant.primary_category,
            customerName: name,
            customerInitials: initials,
            customerCity: customer?.city ?? '',
            customerMobile: customer?.mobile ?? '',
            headlineItem: `Rental ${r.contract_number}`,
            itemValue: Number(r.total_amount),
          });
        }),
      );
      setLivePendingInvoices(pendingInvoices.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseAuth.configured, supabaseAuth.session?.user?.id]);

  const merchantRentals = liveRentals ?? demoRentals;

  useEffect(() => {
    // Demo mode — gate on the demo store's merchant. In configured
    // mode RequireRole (role="merchant") has already verified the
    // visitor is a real merchant, so the demo-store check is
    // meaningless and would incorrectly bounce them to
    // /merchant/welcome (whose primary CTA is "Apply as a merchant",
    // hence the "after merchant login I'm sent to registration" bug).
    if (supabaseAuth.configured) return;
    if (!merchant) {
      navigate('/merchant/welcome', { replace: true });
      return;
    }
    if (merchant.status === 'pending') {
      navigate('/merchant/pending', { replace: true });
    }
  }, [supabaseAuth.configured, merchant, navigate]);

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

  const rentalRevenue = useMemo(
    () =>
      merchantRentals
        .filter((r) => r.status !== 'returned')
        .reduce((sum, r) => sum + r.monthlyAmount, 0),
    [merchantRentals],
  );

  const recent = useMemo(
    () =>
      [...merchantRentals]
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .slice(0, 3),
    [merchantRentals],
  );

  if (!merchant) return null;

  const quickActions: QuickAction[] = [
    {
      title: t('merchant.home.startSession'),
      desc: t('merchant.home.startSessionDesc'),
      icon: <SparkleIcon size={18} />,
      to: '/merchant/session/new',
      tone: 'bg-canvas-100 text-ink-700 hairline',
      featured: true,
    },
    {
      title: t('merchant.home.quickInvoice'),
      desc: t('merchant.home.quickInvoiceDesc'),
      icon: <PlusIcon size={18} />,
      to: '/merchant/invoice/new',
      tone: 'bg-canvas-100 text-ink-700 hairline',
    },
    {
      title: t('merchant.home.quickRentals'),
      desc: t('merchant.home.quickRentalsDesc'),
      icon: <CarIcon size={18} />,
      to: '/merchant/rentals',
      tone: 'bg-canvas-100 text-ink-700 hairline',
    },
    {
      title: t('merchant.home.quickApprovals'),
      desc: t('merchant.home.quickApprovalsDesc'),
      icon: <ReceiptIcon size={18} />,
      to: '/merchant/approvals',
      tone: 'bg-gold-50 text-gold-700 ring-gold-400/30',
      count: pendingCount,
    },
    {
      title: t('merchant.home.quickDamages'),
      desc: t('merchant.home.quickDamagesDesc'),
      icon: <GavelIcon size={18} />,
      to: '/merchant/damages',
      tone: 'bg-danger-50 text-danger-600 ring-danger-500/20',
      count: openDamageCount,
    },
    {
      title: t('merchant.home.quickHistory'),
      desc: t('merchant.home.quickHistoryDesc'),
      icon: <HistoryIcon size={18} />,
      to: '/merchant/history',
      tone: 'bg-canvas-100 text-ink-500 hairline',
    },
  ];

  return (
    <>
      <Header
        title={t('merchant.home.title')}
        trailing={<LangToggle tone="dark" />}
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 ring-1 ring-white/15 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/85">
                  <BadgeCheckIcon size={11} />
                  {t('merchant.home.operationsEyebrow')}
                </span>
                <h1 className="mt-4 editorial-title text-[24px] leading-tight truncate text-white">
                  {t('merchant.home.welcome', { name: merchant.companyName })}
                </h1>
                <p className="mt-2 text-[13px] text-white/65 leading-relaxed max-w-[36ch]">
                  {t('merchant.home.operationsSubtitle')}
                </p>
              </div>
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <ChartIcon size={20} />
              </span>
            </div>

            <div className="relative mt-6 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4 backdrop-blur">
              <div className="text-[11px] text-white/55 uppercase tracking-[0.08em]">
                {t('merchant.home.rentalRevenue')}
              </div>
              <div className="mt-1.5 editorial-title text-[30px] num leading-none text-white">
                {formatCurrency(rentalRevenue)}
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11.5px] text-white/65">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                  <span className="num font-semibold text-white/85">{activeCount}</span>
                  <span>{t('merchant.home.summaryActive')}</span>
                </span>
                {pendingCount > 0 && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-white/25" />
                    <span className="inline-flex items-center gap-1.5">
                      <span className="num font-semibold text-white/85">{pendingCount}</span>
                      <span>{t('merchant.home.summaryPending')}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Alerts */}
          {(overdueCount > 0 || openDamageCount > 0) && (
            <section>
              <SectionHeader title={t('merchant.home.alertsTitle')} />
              <div className="space-y-2.5">
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

          {/* Summary */}
          <section>
            <SectionHeader title={t('merchant.home.summaryTitle')} />
            <div className="grid grid-cols-2 gap-2.5">
              <SummaryTile
                label={t('merchant.home.summaryActive')}
                value={activeCount}
                icon={<PackageIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
              />
              <SummaryTile
                label={t('merchant.home.summaryPending')}
                value={pendingCount}
                icon={<ReceiptIcon size={16} />}
                tone="bg-gold-50 text-gold-700"
              />
              <SummaryTile
                label={t('merchant.home.summaryOverdue')}
                value={overdueCount}
                icon={<ClockIcon size={16} />}
                tone="bg-danger-50 text-danger-600"
                emphasize={overdueCount > 0}
              />
              <SummaryTile
                label={t('merchant.home.summaryDamages')}
                value={openDamageCount}
                icon={<GavelIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
                emphasize={openDamageCount > 0}
              />
            </div>
          </section>

          {/* Quick actions */}
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
                        a.featured ? 'bg-white/15 text-white ring-white/20' : a.tone,
                      )}
                    >
                      {a.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'text-[13.5px] font-semibold truncate',
                            a.featured ? 'text-white' : 'text-ink-900',
                          )}
                        >
                          {a.title}
                        </div>
                        {typeof a.count === 'number' && a.count > 0 && (
                          <span className="ms-auto num text-[11.5px] font-bold bg-ink-900 text-white rounded-full h-5 min-w-5 px-1.5 grid place-items-center">
                            {a.count}
                          </span>
                        )}
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

          {/* Recent activity */}
          <section>
            <SectionHeader
              title={t('merchant.home.recentTitle')}
              action={<Link to="/merchant/rentals">{t('merchant.home.viewAll')}</Link>}
            />
            <Card padded className="space-y-1">
              {recent.map((r, i) => (
                <div key={r.id}>
                  <RecentRow rental={r} formatDate={formatDate} formatCurrency={formatCurrency} t={t} />
                  {i < recent.length - 1 && <div className="h-px bg-canvas-200/80" />}
                </div>
              ))}
            </Card>
          </section>

          {/* Sign out */}
          <div className="pt-2">
            <Button
              variant="secondary"
              block
              onClick={async () => {
                // When Supabase is configured, the real session is the
                // authoritative one — clear it FIRST so a refresh
                // doesn't hydrate the user straight back into the
                // merchant area. Then clean up the demo merchant state.
                if (supabaseAuth.configured) {
                  try {
                    await supabaseAuth.signOut();
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[applux] merchant signOut failed', err);
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

type QuickAction = {
  title: string;
  desc: string;
  icon: React.ReactNode;
  to: string;
  tone: string;
  featured?: boolean;
  count?: number;
};

type AlertRowProps = {
  tone: 'danger' | 'warn';
  icon: React.ReactNode;
  title: React.ReactNode;
  hint: React.ReactNode;
  cta: React.ReactNode;
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

function SummaryTile({
  label,
  value,
  icon,
  tone,
  emphasize,
}: {
  label: React.ReactNode;
  value: number;
  icon: React.ReactNode;
  tone: string;
  emphasize?: boolean;
}) {
  return (
    <Card padded className={cn('space-y-2', emphasize && 'ring-danger-500/20')}>
      <div className="flex items-center justify-between">
        <div className={cn('h-8 w-8 rounded-lg grid place-items-center', tone)}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
          {label}
        </div>
        <div className="mt-0.5 text-[22px] font-bold text-ink-900 num leading-none">
          {value}
        </div>
      </div>
    </Card>
  );
}

function RecentRow({
  rental,
  formatDate,
  formatCurrency,
  t,
}: {
  rental: MerchantRental;
  formatDate: (d: string) => string;
  formatCurrency: (n: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const tone: StatusTone =
    rental.status === 'overdue'
      ? 'danger'
      : rental.status === 'due-soon'
        ? 'warn'
        : 'success';
  return (
    <Link to="/merchant/rentals" className="flex items-center gap-3 py-2.5">
      <span className="relative shrink-0">
        <RentalThumbnail
          category={rental.category}
          title={rental.item}
          size="md"
          tone="canvas"
        />
        <span className="absolute -bottom-1 -end-1 h-5 min-w-5 px-1 rounded-full bg-ink-900 text-white num text-[9.5px] font-bold grid place-items-center ring-2 ring-white">
          {rental.customerInitials}
        </span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {rental.customerName}
        </div>
        <div className="mt-0.5 text-[12px] text-ink-400 truncate">
          {rental.item} · {t('merchant.rentals.returnDate')} {formatDate(rental.endDate)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="text-[13px] font-semibold num text-ink-900">
          {formatCurrency(rental.monthlyAmount)}
        </div>
        <StatusChip
          size="sm"
          tone={tone}
          dot
          label={t(`merchant.rentals.status.${rental.status}`)}
        />
      </div>
    </Link>
  );
}
