import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  SectionHeader,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore, type MerchantStatus } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';

type StateVisual = {
  badgeTone: StatusTone;
  badgeKey: string;
  titleKey: string;
  subtitleKey: string;
  haloClass: string;
  iconBox: string;
  icon: typeof ClockIcon;
};

const STATE_VISUALS: Record<MerchantStatus, StateVisual> = {
  pending: {
    badgeTone: 'warn',
    badgeKey: 'merchant.pending.states.pending.badge',
    titleKey: 'merchant.pending.states.pending.title',
    subtitleKey: 'merchant.pending.states.pending.subtitle',
    haloClass: 'bg-warn-500/25',
    iconBox: 'bg-warn-500/20 ring-warn-400/30 text-warn-200',
    icon: ClockIcon,
  },
  approved: {
    badgeTone: 'success',
    badgeKey: 'merchant.pending.states.approved.badge',
    titleKey: 'merchant.pending.states.approved.title',
    subtitleKey: 'merchant.pending.states.approved.subtitle',
    haloClass: 'bg-success-500/25',
    iconBox: 'bg-success-500/20 ring-success-400/30 text-success-200',
    icon: BadgeCheckIcon,
  },
  rejected: {
    badgeTone: 'danger',
    badgeKey: 'merchant.pending.states.rejected.badge',
    titleKey: 'merchant.pending.states.rejected.title',
    subtitleKey: 'merchant.pending.states.rejected.subtitle',
    haloClass: 'bg-danger-500/25',
    iconBox: 'bg-danger-500/20 ring-danger-400/30 text-danger-200',
    icon: AlertIcon,
  },
};

export default function MerchantPending() {
  const t = useT();
  const { formatDate } = useI18n();
  const navigate = useNavigate();
  const {
    merchant,
    merchantDecisions,
    approveMerchant,
    rejectMerchant,
    resubmitMerchantRequest,
    signOutMerchant,
  } = useStore();
  const supabaseAuth = useSupabaseAuth();

  // Shared logout — when Supabase is configured, sign out of the real
  // session first so a refresh doesn't hydrate the user straight back
  // into the merchant area. Then clean up the demo merchant state.
  const handleSignOut = async () => {
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
  };

  useEffect(() => {
    // Demo mode only — gate on the demo store's merchant. In configured
    // mode the user reaches this page via explicit navigation from
    // MerchantRegister after submitting their application, before
    // their role is promoted from 'customer' to 'merchant'. Bouncing
    // on the empty demo store would dump them on /merchant/welcome
    // and they'd never see their pending status.
    if (supabaseAuth.configured) return;
    if (!merchant) {
      navigate('/merchant/welcome', { replace: true });
    }
  }, [supabaseAuth.configured, merchant, navigate]);

  // Source of truth: the admin's decision in the store (same map the admin
  // writes to via approveMerchantRequest / rejectMerchantRequest). Falls back
  // to the local profile for any session created before this mapping existed.
  const decision = merchant ? merchantDecisions[merchant.id] : undefined;
  const effectiveStatus: MerchantStatus =
    decision?.status ?? merchant?.status ?? 'pending';

  const visual = useMemo(
    () => STATE_VISUALS[effectiveStatus],
    [effectiveStatus],
  );

  if (!merchant) return null;

  const HeroIcon = visual.icon;
  const rejectionReason =
    decision?.notes ?? merchant.rejectionReason ?? null;
  const decisionAt =
    effectiveStatus === 'approved'
      ? decision?.decidedAt ?? merchant.approvedAt
      : effectiveStatus === 'rejected'
        ? decision?.decidedAt ?? merchant.rejectedAt
        : null;

  return (
    <>
      <Header title={t(`merchant.pending.headers.${effectiveStatus}`)} />
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
              className={`pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full ${visual.haloClass} blur-3xl`}
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11.5px] font-semibold">
                  <HeroIcon size={13} />
                  {t(visual.badgeKey)}
                </span>
                <h1 className="mt-4 editorial-title text-[26px] leading-tight text-white">
                  {t(visual.titleKey)}
                </h1>
                <p className="mt-2.5 text-[13px] text-white/65 leading-relaxed max-w-[36ch]">
                  {t(visual.subtitleKey)}
                </p>
              </div>
              <span
                className={`h-12 w-12 shrink-0 rounded-2xl ring-1 grid place-items-center ${visual.iconBox}`}
              >
                <HeroIcon size={22} />
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
                  {t(`merchant.pending.timestampLabel.${effectiveStatus}`)}
                </div>
                <div className="mt-0.5 font-semibold num">
                  {formatDate(decisionAt ?? merchant.submittedAt)}
                </div>
              </div>
            </div>
          </div>

          {effectiveStatus === 'rejected' && (
            <section>
              <SectionHeader title={t('merchant.pending.rejection.title')} />
              <Card padded className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="h-9 w-9 shrink-0 rounded-xl bg-danger-50 text-danger-600 grid place-items-center ring-1 ring-danger-100">
                    <AlertIcon size={16} />
                  </span>
                  <p className="text-[13px] text-ink-800 leading-relaxed">
                    {rejectionReason ||
                      t('merchant.pending.rejection.fallback')}
                  </p>
                </div>
                <div className="text-[11.5px] text-ink-400 num pt-1">
                  {t('merchant.pending.rejection.decidedAt', {
                    date: formatDate(decisionAt ?? merchant.submittedAt),
                  })}
                </div>
              </Card>
            </section>
          )}

          {effectiveStatus === 'pending' && (
            <section>
              <SectionHeader title={t('merchant.pending.whatNextTitle')} />
              <Card padded>
                <ul className="space-y-3">
                  <NextStep
                    icon={<ShieldIcon size={14} />}
                    label={t('merchant.pending.whatNext1')}
                  />
                  <NextStep
                    icon={<WalletIcon size={14} />}
                    label={t('merchant.pending.whatNext2')}
                  />
                  <NextStep
                    icon={<BadgeCheckIcon size={14} />}
                    label={t('merchant.pending.whatNext3')}
                  />
                </ul>
              </Card>
            </section>
          )}

          <section>
            <SectionHeader title={t('merchant.pending.summaryTitle')} />
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center shrink-0">
                  <BuildingIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                    {merchant.companyName}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-400 num truncate">
                    CR {merchant.commercialReg}
                  </div>
                </div>
                <StatusChip
                  size="sm"
                  tone={visual.badgeTone}
                  dot
                  label={t(visual.badgeKey)}
                />
              </div>
              <CardDivider />
              <Field
                label={t('merchant.register.authorizedName')}
                value={merchant.authorizedName}
              />
              <CardDivider />
              <Field
                label={t('merchant.register.iban')}
                value={<span className="num">{merchant.iban}</span>}
              />
              <CardDivider />
              <Field
                label={t('merchant.register.contactEmail')}
                value={merchant.contactEmail}
              />
              <CardDivider />
              <Field
                label={t('merchant.register.contactPhone')}
                value={<span className="num">+966 {merchant.contactPhone}</span>}
              />
              {merchant.branches.length > 0 && (
                <>
                  <CardDivider />
                  <Field
                    label={t('merchant.register.steps.branches')}
                    value={t('merchant.home.branchesCount', {
                      count: merchant.branches.length,
                    })}
                  />
                </>
              )}
            </Card>
          </section>

          <div className="space-y-2.5">
            {effectiveStatus === 'pending' && (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  leading={<CheckIcon size={18} />}
                  onClick={() => approveMerchant()}
                >
                  {t('merchant.pending.simulateApproval')}
                </Button>
                <Button
                  variant="ghost"
                  block
                  leading={<AlertIcon size={16} />}
                  onClick={() =>
                    rejectMerchant(t('merchant.pending.rejection.demoReason'))
                  }
                >
                  {t('merchant.pending.simulateRejection')}
                </Button>
                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    void handleSignOut();
                  }}
                >
                  {t('merchant.pending.signOut')}
                </Button>
              </>
            )}

            {effectiveStatus === 'approved' && (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  leading={<CheckIcon size={18} />}
                  onClick={() => navigate('/merchant/home', { replace: true })}
                >
                  {t('merchant.pending.continueToDashboard')}
                </Button>
                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    void handleSignOut();
                  }}
                >
                  {t('merchant.pending.signOut')}
                </Button>
              </>
            )}

            {effectiveStatus === 'rejected' && (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  onClick={() => resubmitMerchantRequest()}
                >
                  {t('merchant.pending.resubmit')}
                </Button>
                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    void handleSignOut();
                  }}
                >
                  {t('merchant.pending.signOut')}
                </Button>
              </>
            )}
          </div>
        </div>
      </Screen>
    </>
  );
}

function NextStep({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="h-8 w-8 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center ring-1 hairline">
        {icon}
      </span>
      <span className="text-[13px] text-ink-700 leading-relaxed">{label}</span>
    </li>
  );
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">
        {value}
      </div>
    </div>
  );
}
