import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  PageSkeleton,
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
  const { configured, status, role } = supabaseAuth;

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

  // Provisioned → straight to the dashboard.
  useEffect(() => {
    if (configured && status === 'authenticated' && role === 'merchant') {
      navigate('/merchant/home', { replace: true });
    }
  }, [configured, status, role, navigate]);

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
          commercialReg: liveApp.commercial_reg_number,
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
      <>
        <Header title={t('merchant.pending.headers.pending')} />
        <Screen padded={false} className="bg-canvas">
          <div className="px-5 pt-5 pb-10">
            <PageSkeleton rows={4} />
          </div>
        </Screen>
      </>
    );
  }

  if (!view) return null;

  const HeroIcon = visual.icon;
  const rejectionReason = view.rejectionReason;
  const decisionAt = view.decidedAt;

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
                <div className="mt-0.5 font-semibold num truncate">{view.refId}</div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t(`merchant.pending.timestampLabel.${effectiveStatus}`)}
                </div>
                <div className="mt-0.5 font-semibold num">
                  {formatDate(decisionAt ?? view.submittedAt)}
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
                    date: formatDate(decisionAt ?? view.submittedAt),
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
                    {view.companyName}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-400 num truncate">
                    CR {view.commercialReg}
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
            </Card>
          </section>

          <div className="space-y-2.5">
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
