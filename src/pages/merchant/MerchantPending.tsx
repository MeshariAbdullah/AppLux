import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout';
import {
  Button,
  CardDivider,
  PageSkeleton,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  RefreshIcon,
  ShieldIcon,
  WalletIcon,
} from '@/components/icons';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore, type MerchantStatus } from '@/lib/store';
import {
  listMerchantApplications,
  useSupabaseAuth,
  type MerchantApplicationRow,
} from '@/lib/supabase';

type StateVisual = {
  badgeTone: StatusTone;
  badgeKey: string;
  titleKey: string;
  subtitleKey: string;
  circle: string;
  icon: typeof ClockIcon;
};

// Design M07 — each state gets a tinted status circle over the beige
// canvas: amber clock (pending), green badge (approved), red alert
// (rejected).
const STATE_VISUALS: Record<MerchantStatus, StateVisual> = {
  pending: {
    badgeTone: 'warn',
    badgeKey: 'merchant.pending.states.pending.badge',
    titleKey: 'merchant.pending.states.pending.title',
    subtitleKey: 'merchant.pending.states.pending.subtitle',
    circle: 'bg-warn-50 text-warn-600',
    icon: ClockIcon,
  },
  approved: {
    badgeTone: 'success',
    badgeKey: 'merchant.pending.states.approved.badge',
    titleKey: 'merchant.pending.states.approved.title',
    subtitleKey: 'merchant.pending.states.approved.subtitle',
    circle: 'bg-green-50 text-green-700',
    icon: BadgeCheckIcon,
  },
  rejected: {
    badgeTone: 'danger',
    badgeKey: 'merchant.pending.states.rejected.badge',
    titleKey: 'merchant.pending.states.rejected.title',
    subtitleKey: 'merchant.pending.states.rejected.subtitle',
    circle: 'bg-danger-50 text-danger-600',
    icon: AlertIcon,
  },
};

/** The fields the template renders, produced from either source. */
type PendingView = {
  refId: string;
  companyName: string;
  commercialReg: string;
  authorizedName: string;
  iban: string | null; // demo only — live applications never carry one
  contactEmail: string | null;
  contactPhone: string | null;
  branchesCount: number; // demo only
  submittedAt: string;
  decidedAt: string | null;
  rejectionReason: string | null;
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
  const { configured, status, role, profile } = supabaseAuth;

  // ---- LIVE source (Auth Hardening Phase 1) ----
  // The page previously rendered the DEMO store even in live mode, so a
  // real applicant saw a static fiction. Now it reads the caller's own
  // latest merchant_applications row (RLS-scoped), with a manual
  // refresh and a refetch-on-focus. `undefined` = loading.
  const [liveApp, setLiveApp] = useState<MerchantApplicationRow | null | undefined>(
    configured ? undefined : null,
  );
  const [refreshing, setRefreshing] = useState(false);

  // Fetch the application row ONLY. Deliberately does not touch the
  // auth provider: provider.refresh() flips profileLoading, which makes
  // the RequireRole guard swap this page for a spinner (unmount →
  // remount → refetch — an infinite loop when wired into mount/focus).
  const loadApp = useCallback(async () => {
    if (!configured) return;
    setRefreshing(true);
    try {
      const rows = await listMerchantApplications({ limit: 1 });
      setLiveApp(rows[0] ?? null);
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'load_own_merchant_application' }, err);
      setLiveApp((prev) => (prev === undefined ? null : prev));
    } finally {
      setRefreshing(false);
    }
  }, [configured]);

  // Explicit refresh (button / approved CTA): also re-pull the profile
  // so an admin provisioning that lifted role → 'merchant' routes the
  // user forward via the role effect below. Safe here because it runs
  // once per tap, not per mount.
  const refreshAll = useCallback(async () => {
    await loadApp();
    if (configured) {
      try {
        await supabaseAuth.refresh();
      } catch {
        // Non-fatal — the next explicit refresh or re-login covers it.
      }
    }
    // supabaseAuth.refresh identity churns with provider state; the
    // closure over the current render's provider is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadApp, configured]);

  useEffect(() => {
    if (!configured) return;
    void loadApp();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadApp();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [configured, loadApp]);

  // Provisioned (merchant + ACTIVE) → straight to the dashboard.
  // Merchant separation M2: merchant accounts now exist BEFORE approval
  // with account_status='pending' — those stay here and see their
  // application status.
  useEffect(() => {
    if (
      configured &&
      status === 'authenticated' &&
      role === 'merchant' &&
      profile?.account_status === 'active'
    ) {
      navigate('/merchant/home', { replace: true });
    }
  }, [configured, status, role, profile?.account_status, navigate]);

  // Live mode with NO application at all → nothing to show here.
  useEffect(() => {
    if (configured && liveApp === null) {
      navigate('/merchant/welcome', { replace: true });
    }
  }, [configured, liveApp, navigate]);

  // Shared logout — when Supabase is configured, sign out of the real
  // session first so a refresh doesn't hydrate the user straight back
  // into the merchant area. Then clean up the demo merchant state.
  const handleSignOut = async () => {
    if (supabaseAuth.configured) {
      try {
        await supabaseAuth.signOut();
      } catch (err) {
        logEvent('rpc_failure', 'warn', { op: 'merchant_sign_out' }, err);
      }
    }
    signOutMerchant();
    navigate('/merchant/welcome', { replace: true });
  };

  useEffect(() => {
    // Demo mode only — gate on the demo store's merchant. (Live mode
    // has its own no-application redirect above.)
    if (supabaseAuth.configured) return;
    if (!merchant) {
      navigate('/merchant/welcome', { replace: true });
    }
  }, [supabaseAuth.configured, merchant, navigate]);

  // Demo source of truth: the admin's decision in the store (same map
  // the demo admin writes to). Live source: the application row.
  const decision = merchant ? merchantDecisions[merchant.id] : undefined;
  const effectiveStatus: MerchantStatus = configured
    ? (liveApp?.status ?? 'pending')
    : (decision?.status ?? merchant?.status ?? 'pending');

  const visual = useMemo(
    () => STATE_VISUALS[effectiveStatus],
    [effectiveStatus],
  );

  // Unified view model. Live: decision_notes are deliberately NOT
  // exposed (internal admin notes); the rejected state shows the
  // neutral fallback copy.
  const view: PendingView | null = configured
    ? liveApp
      ? {
          refId: liveApp.id.slice(0, 8).toUpperCase(),
          companyName: liveApp.company_name,
          commercialReg: liveApp.unified_number ?? liveApp.commercial_reg_number ?? '',
          authorizedName: liveApp.authorized_name,
          iban: null,
          contactEmail: liveApp.contact_email ?? null,
          contactPhone: liveApp.contact_phone ?? null,
          branchesCount: 0,
          submittedAt: liveApp.submitted_at,
          decidedAt: liveApp.decided_at ?? null,
          rejectionReason: null,
        }
      : null
    : merchant
      ? {
          refId: merchant.id,
          companyName: merchant.companyName,
          commercialReg: merchant.commercialReg,
          authorizedName: merchant.authorizedName,
          iban: merchant.iban || null,
          contactEmail: merchant.contactEmail || null,
          contactPhone: merchant.contactPhone || null,
          branchesCount: merchant.branches.length,
          submittedAt: merchant.submittedAt,
          decidedAt:
            effectiveStatus === 'approved'
              ? decision?.decidedAt ?? merchant.approvedAt ?? null
              : effectiveStatus === 'rejected'
                ? decision?.decidedAt ?? merchant.rejectedAt ?? null
                : null,
          rejectionReason: decision?.notes ?? merchant.rejectionReason ?? null,
        }
      : null;

  // Live loading (first fetch in flight).
  if (configured && liveApp === undefined) {
    return (
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+24px)] pb-10">
          <PageSkeleton rows={4} />
        </div>
      </Screen>
    );
  }

  if (!view) return null;

  const HeroIcon = visual.icon;
  const rejectionReason = view.rejectionReason;
  const decisionAt = view.decidedAt;

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+40px)] pb-10 flex flex-col items-center">
          {/* M07 — centered status circle + title + subtitle */}
          <span
            className={`h-[76px] w-[76px] rounded-full grid place-items-center ${visual.circle}`}
          >
            <HeroIcon size={30} strokeWidth={1.8} />
          </span>
          <h1 className="mt-5 text-[20px] font-bold text-navy-700 text-center leading-snug">
            {t(visual.titleKey)}
          </h1>
          <p className="mt-2 text-[13px] text-ink-600 text-center leading-[1.9] max-w-[280px]">
            {t(visual.subtitleKey)}
          </p>

          {/* Request-id card — reference + status chip, then the
              state-appropriate timestamp */}
          <div className="mt-5 w-full rounded-xl2 bg-white ring-1 ring-beige-200 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11.5px] text-ink-500">
                  {t('merchant.pending.requestId')}
                </div>
                <div className="mt-0.5 text-[14px] font-bold num truncate" dir="ltr">
                  {view.refId}
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
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-ink-500">
                {t(`merchant.pending.timestampLabel.${effectiveStatus}`)}
              </span>
              <span className="font-semibold text-ink-900 num">
                {formatDate(decisionAt ?? view.submittedAt)}
              </span>
            </div>
          </div>

          {/* Rejection banner — demo decisions carry a reason; live
              rejections deliberately do NOT expose admin decision_notes
              (the neutral copy above already covers them). */}
          {effectiveStatus === 'rejected' && rejectionReason && (
            <div className="mt-3 w-full rounded-xl2 bg-danger-50 ring-1 ring-danger-500/20 px-4 py-3.5">
              <div className="text-[12.5px] font-bold text-danger-700">
                {t('merchant.pending.rejection.title')}
              </div>
              <p className="mt-1 text-[12.5px] text-danger-700 leading-[1.8]">
                {rejectionReason}
              </p>
              <div className="mt-1.5 text-[11.5px] text-danger-600/80 num">
                {t('merchant.pending.rejection.decidedAt', {
                  date: formatDate(decisionAt ?? view.submittedAt),
                })}
              </div>
            </div>
          )}

          {effectiveStatus === 'pending' && (
            <div className="mt-3 w-full rounded-xl2 bg-white ring-1 ring-beige-200 p-4">
              <div className="text-[12.5px] font-bold text-navy-700 mb-3">
                {t('merchant.pending.whatNextTitle')}
              </div>
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
            </div>
          )}

          {/* Application summary */}
          <div className="mt-3 w-full rounded-xl2 bg-white ring-1 ring-beige-200 p-4 space-y-3">
            <div className="text-[12.5px] font-bold text-navy-700">
              {t('merchant.pending.summaryTitle')}
            </div>
            <div className="flex items-start gap-3">
              <span className="h-10 w-10 rounded-xl bg-navy-50 text-navy-700 grid place-items-center shrink-0">
                <BuildingIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                  {view.companyName}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-400 num truncate">
                  CR {view.commercialReg}
                </div>
              </div>
            </div>
            <CardDivider />
            <Field
              label={t('merchant.register.authorizedName')}
              value={view.authorizedName}
            />
            {view.iban && (
              <>
                <CardDivider />
                <Field
                  label={t('merchant.register.iban')}
                  value={<span className="num">{view.iban}</span>}
                />
              </>
            )}
            {view.contactEmail && (
              <>
                <CardDivider />
                <Field
                  label={t('merchant.register.contactEmail')}
                  value={view.contactEmail}
                />
              </>
            )}
            {view.contactPhone && (
              <>
                <CardDivider />
                <Field
                  label={t('merchant.register.contactPhone')}
                  value={<span className="num">+966 {view.contactPhone}</span>}
                />
              </>
            )}
            {view.branchesCount > 0 && (
              <>
                <CardDivider />
                <Field
                  label={t('merchant.register.steps.branches')}
                  value={t('merchant.home.branchesCount', {
                    count: view.branchesCount,
                  })}
                />
              </>
            )}
          </div>

          <div className="mt-5 w-full space-y-2.5">
            {/* Live mode: manual status refresh (also fired on focus).
                Re-reads the application AND the profile role, so an
                admin approval moves the user forward without a
                re-login. */}
            {supabaseAuth.configured && effectiveStatus !== 'approved' && (
              <Button
                variant="secondary"
                block
                loading={refreshing}
                leading={<RefreshIcon size={16} />}
                onClick={() => void refreshAll()}
              >
                {t('merchant.pending.refresh')}
              </Button>
            )}
            {effectiveStatus === 'pending' && (
              <>
                {/* Self-approve / self-reject simulators are DEMO ONLY
                    — they mutate the in-memory store and would let a
                    real pending merchant appear to approve their own
                    application. Hidden when Supabase is configured;
                    real approvals only happen from the admin console. */}
                {!supabaseAuth.configured && (
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
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  className="flex items-center justify-center h-13 w-full rounded-xl2 bg-white text-navy-700 font-bold text-[14px] ring-[1.5px] ring-inset ring-navy-700 hover:bg-navy-50 transition-colors"
                >
                  {t('merchant.pending.signOut')}
                </button>
              </>
            )}

            {effectiveStatus === 'approved' && (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  block
                  loading={refreshing}
                  leading={<CheckIcon size={18} />}
                  onClick={() => {
                    // Live: approval flips the profile role at
                    // provisioning time — refresh the snapshot and the
                    // role-promotion effect above navigates. Demo keeps
                    // the direct hop.
                    if (supabaseAuth.configured) void refreshAll();
                    else navigate('/merchant/home', { replace: true });
                  }}
                >
                  {t('merchant.pending.continueToDashboard')}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  className="flex items-center justify-center h-13 w-full rounded-xl2 bg-white text-navy-700 font-bold text-[14px] ring-[1.5px] ring-inset ring-navy-700 hover:bg-navy-50 transition-colors"
                >
                  {t('merchant.pending.signOut')}
                </button>
              </>
            )}

            {effectiveStatus === 'rejected' && (
              <>
                {/* Resubmit is demo-only — there is no real "resubmit"
                    RPC. A real rejected merchant has to start a new
                    application from /merchant/register. */}
                {!supabaseAuth.configured && (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    onClick={() => resubmitMerchantRequest()}
                  >
                    {t('merchant.pending.resubmit')}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  className="flex items-center justify-center h-13 w-full rounded-xl2 bg-white text-navy-700 font-bold text-[14px] ring-[1.5px] ring-inset ring-navy-700 hover:bg-navy-50 transition-colors"
                >
                  {t('merchant.pending.signOut')}
                </button>
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
      <span className="h-8 w-8 shrink-0 rounded-xl bg-green-50 text-green-700 grid place-items-center">
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
