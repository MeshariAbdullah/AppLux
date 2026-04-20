import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  BadgeCheckIcon,
  BuildingIcon,
  ChartIcon,
  ChevronIcon,
  PackageIcon,
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

export default function MerchantHome() {
  const t = useT();
  const { formatDate, dir } = useI18n();
  const navigate = useNavigate();
  const { merchant, signOutMerchant } = useStore();

  useEffect(() => {
    if (!merchant) {
      navigate('/merchant/welcome', { replace: true });
      return;
    }
    if (merchant.status === 'pending') {
      navigate('/merchant/pending', { replace: true });
    }
  }, [merchant, navigate]);

  if (!merchant) return null;

  const quickActions = [
    {
      icon: <PackageIcon size={18} />,
      title: t('merchant.home.quickIssue'),
      desc: t('merchant.home.quickIssueDesc'),
      tone: 'bg-brand-50 text-brand-600',
    },
    {
      icon: <BuildingIcon size={18} />,
      title: t('merchant.home.quickBranches'),
      desc: t('merchant.home.quickBranchesDesc'),
      tone: 'bg-ink-100 text-ink-700',
    },
    {
      icon: <ChartIcon size={18} />,
      title: t('merchant.home.quickReports'),
      desc: t('merchant.home.quickReportsDesc'),
      tone: 'bg-[#FBF2DD] text-gold-600',
    },
  ];

  return (
    <>
      <Header
        title={t('merchant.home.title')}
        trailing={<LangToggle tone="dark" />}
      />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-4">
          {/* Approved hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 shadow-float">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div aria-hidden className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-success-500/25 blur-3xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-500/15 ring-1 ring-success-400/30 px-2.5 py-1 text-[11.5px] font-semibold text-success-200">
                  <BadgeCheckIcon size={13} />
                  {t('merchant.home.statusApproved')}
                </span>
                <h1 className="mt-3 text-[22px] leading-tight font-bold truncate">
                  {t('merchant.home.welcome', { name: merchant.companyName })}
                </h1>
                <p className="mt-2 text-[13px] text-white/70 leading-relaxed max-w-[36ch]">
                  {t('merchant.home.subtitle')}
                </p>
              </div>
              <span className="h-12 w-12 shrink-0 rounded-2xl bg-success-500/20 ring-1 ring-success-400/30 text-success-200 grid place-items-center">
                <BadgeCheckIcon size={22} />
              </span>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.pending.requestId')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">{merchant.id}</div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.home.approvedAt')}
                </div>
                <div className="mt-0.5 font-semibold num">
                  {merchant.approvedAt ? formatDate(merchant.approvedAt) : '—'}
                </div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.register.commercialReg')}
                </div>
                <div className="mt-0.5 font-semibold num">{merchant.commercialReg}</div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.register.steps.branches')}
                </div>
                <div className="mt-0.5 font-semibold">
                  {t('merchant.home.branchesCount', { count: merchant.branches.length })}
                </div>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <section>
            <SectionHeader title={t('merchant.home.quickActionsTitle')} />
            <div className="space-y-2.5">
              {quickActions.map((a, i) => (
                <Card
                  key={i}
                  padded
                  interactive
                  className="flex items-center gap-3"
                >
                  <span className={cn('h-10 w-10 shrink-0 rounded-xl grid place-items-center', a.tone)}>
                    {a.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                        {a.title}
                      </div>
                      <StatusChip
                        size="sm"
                        tone="neutral"
                        dot={false}
                        icon={<SparkleIcon size={11} />}
                        label={t('merchant.home.comingSoon')}
                      />
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-400 leading-relaxed">
                      {a.desc}
                    </div>
                  </div>
                  <ChevronIcon
                    size={16}
                    className={cn('text-ink-300 shrink-0', dir === 'rtl' ? 'rotate-180' : '')}
                  />
                </Card>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-ink-400 leading-relaxed text-center">
              {t('merchant.home.comingSoonHint')}
            </p>
          </section>

          {/* Sign out */}
          <div className="pt-2">
            <Button
              variant="secondary"
              block
              onClick={() => {
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
