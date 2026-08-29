import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  ConfirmSheet,
  EmptyState,
  FormField,
  Input,
  PageSkeleton,
  ProgressBar,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  DocIcon,
  HistoryIcon,
  InfoIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  ReceiptIcon,
  ShieldIcon,
  SupportIcon,
  UserIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { adminUserStatusTone as statusTone } from '@/lib/format/statusTones';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptUserRecord,
  fetchEligibility,
  fetchProfile,
  updateProfile,
  upsertEligibility,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { AdminUserRecord } from '@/lib/data';
import type {
  AdminUserActivity,
  AdminUserActivityType,
  AdminUserRiskTier,
  AdminUserStatus,
} from '@/lib/data';

function riskTone(r: AdminUserRiskTier): StatusTone {
  if (r === 'gold') return 'gold';
  if (r === 'watch') return 'danger';
  return 'neutral';
}

function activityIcon(type: AdminUserActivityType): ReactNode {
  switch (type) {
    case 'rental':
      return <PackageIcon size={14} />;
    case 'payment':
      return <WalletIcon size={14} />;
    case 'contract':
      return <DocIcon size={14} />;
    case 'return':
      return <ReceiptIcon size={14} />;
    case 'verification':
      return <ShieldIcon size={14} />;
    case 'support':
      return <SupportIcon size={14} />;
  }
}

function activityTone(type: AdminUserActivityType): string {
  switch (type) {
    case 'rental':
      return 'bg-canvas-100 text-ink-700';
    case 'payment':
      return 'bg-success-50 text-success-600';
    case 'contract':
      return 'bg-gold-50 text-gold-700';
    case 'return':
      return 'bg-canvas-100 text-ink-600';
    case 'verification':
      return 'bg-canvas-100 text-ink-700';
    case 'support':
      return 'bg-warn-50 text-warn-600';
  }
}

function parseLimit(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  return Number(digits);
}

export default function AdminUserDetails() {
  const t = useT();
  const navigate = useNavigate();
  const { dir, formatCurrency, formatDate, formatNumber } = useI18n();
  const { id = '' } = useParams<{ id: string }>();
  const {
    adminUsers,
    setAdminUserStatus,
    setAdminUserLimit,
    resetAdminUser,
  } = useStore();
  const { configured } = useSupabaseAuth();
  const [liveUser, setLiveUser] = useState<AdminUserRecord | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(
    () => configured && Boolean(id),
  );

  useEffect(() => {
    if (!configured || !id) {
      setLiveUser(null);
      setLiveLoading(false);
      return;
    }
    // Phase 9 entity-leak fix — clear previous user before fetching.
    setLiveUser(null);
    setLiveLoading(true);
    let cancelled = false;
    (async () => {
      const [profile, eligibility] = await Promise.all([
        fetchProfile(id).catch(() => null),
        fetchEligibility(id).catch(() => null),
      ]);
      if (cancelled) return;
      if (profile) {
        setLiveUser(adaptUserRecord(profile, eligibility));
      }
      setLiveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, id]);

  const demoUser = useMemo(
    () => adminUsers.find((u) => u.id === id) ?? null,
    [adminUsers, id],
  );

  const user = configured ? liveUser : demoUser;

  const [limitDraft, setLimitDraft] = useState<string>(
    user ? String(user.eligibilityLimit) : '',
  );
  const [toast, setToast] = useState<{
    tone: 'success' | 'danger' | 'warn';
    title: string;
    hint?: string;
  } | null>(null);
  const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [limitSaving, setLimitSaving] = useState(false);

  useEffect(() => {
    if (user) setLimitDraft(String(user.eligibilityLimit));
  }, [user?.id, user?.eligibilityLimit]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Phase 9: loading first so we never flash the "not found" empty
  // state while the live fetch is still in flight (or after the :id
  // route param has just changed).
  if (configured && liveLoading) {
    return (
      <>
        <Header title={t('admin.user.title')} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-4 pt-6">
            <PageSkeleton rows={4} />
          </div>
        </Screen>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header title={t('admin.user.title')} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-4 pt-6">
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('admin.user.notFound.title')}
              description={t('admin.user.notFound.hint')}
              action={
                <Button onClick={() => navigate('/admin/users')}>
                  {t('admin.user.notFound.cta')}
                </Button>
              }
            />
          </div>
        </Screen>
      </>
    );
  }

  const remaining = Math.max(user.eligibilityLimit - user.usedAmount, 0);
  const pct =
    user.eligibilityLimit > 0
      ? Math.min(100, Math.round((user.usedAmount / user.eligibilityLimit) * 100))
      : 0;
  const parsed = parseLimit(limitDraft);
  const limitChanged = parsed !== user.eligibilityLimit;
  const limitInvalid = parsed < user.usedAmount;
  const canSaveLimit = limitChanged && !limitInvalid;

  const handleSaveLimit = async () => {
    if (!canSaveLimit || limitSaving) return;
    setLimitSaving(true);
    try {
      if (configured) {
        // Real write: upsert rental_eligibility (admin policy
        // `rental_eligibility_admin_all` allows this). After the row
        // returns, replace liveUser so the limit chip refreshes from
        // the authoritative server state.
        const updated = await upsertEligibility({
          user_id: user.id,
          limit_amount: parsed,
        });
        const profile = await fetchProfile(user.id).catch(() => null);
        if (profile) setLiveUser(adaptUserRecord(profile, updated));
      } else {
        setAdminUserLimit(user.id, parsed);
      }
      setToast({
        tone: 'success',
        title: t('admin.user.toast.limitSaved.title'),
        hint: t('admin.user.toast.limitSaved.hint', {
          amount: formatCurrency(parsed),
        }),
      });
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'upsert_eligibility' }, err);
      setToast({
        tone: 'danger',
        title: t('admin.user.toast.limitFailed.title'),
        hint:
          err instanceof Error
            ? err.message
            : t('admin.user.toast.limitFailed.hint'),
      });
    } finally {
      setLimitSaving(false);
    }
  };

  /**
   * Write the new account_status to the right place.
   * - Configured mode: updates `profiles.account_status` via the real
   *   Supabase mutation (RLS policy `profiles_admin_update` allows
   *   admins to do this). On success the live state is replaced from
   *   the update's returning row + a fresh eligibility fetch, so the
   *   status chip flips immediately without a manual refresh.
   * - Demo mode: same in-memory store call as before.
   * Failures show a danger toast instead of silently appearing to
   * succeed.
   */
  const applyStatus = async (
    next: AdminUserStatus,
    successToast: { tone: 'success' | 'danger'; titleKey: string; hintKey: string },
  ) => {
    if (statusUpdating) return;
    setStatusUpdating(true);
    try {
      if (configured) {
        const updated = await updateProfile(user.id, { account_status: next });
        // Refetch eligibility in case the limit panel needs to refresh
        // alongside the status change.
        const eligibility = await fetchEligibility(user.id).catch(() => null);
        setLiveUser(adaptUserRecord(updated, eligibility));
      } else {
        setAdminUserStatus(user.id, next);
      }
      setToast({
        tone: successToast.tone,
        title: t(successToast.titleKey),
        hint: t(successToast.hintKey),
      });
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'admin_status_update' }, err);
      setToast({
        tone: 'danger',
        title: t('admin.user.toast.statusFailed.title'),
        hint:
          err instanceof Error
            ? err.message
            : t('admin.user.toast.statusFailed.hint'),
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleToggleStatus = () => {
    if (user.status === 'pending') {
      void applyStatus('active', {
        tone: 'success',
        titleKey: 'admin.user.toast.activated.title',
        hintKey: 'admin.user.toast.activated.hint',
      });
      return;
    }
    if (user.status === 'suspended') {
      void applyStatus('active', {
        tone: 'success',
        titleKey: 'admin.user.toast.reactivated.title',
        hintKey: 'admin.user.toast.reactivated.hint',
      });
      return;
    }
    // Suspending an active user is destructive — confirm first.
    setSuspendConfirmOpen(true);
  };

  const handleConfirmedSuspend = () => {
    setSuspendConfirmOpen(false);
    void applyStatus('suspended', {
      tone: 'danger',
      titleKey: 'admin.user.toast.suspended.title',
      hintKey: 'admin.user.toast.suspended.hint',
    });
  };

  const handleReset = () => {
    resetAdminUser(user.id);
    setToast({
      tone: 'warn',
      title: t('admin.user.toast.reset.title'),
      hint: t('admin.user.toast.reset.hint'),
    });
  };

  const recentActivity = [...user.activity]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  return (
    <>
      <Header
        title={t('admin.user.title')}
        subtitle={user.fullName}
        showBack
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
            <div className="relative flex items-start gap-3">
              <span className="h-12 w-12 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white font-semibold text-[13px]">
                {user.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="editorial-title text-[22px] leading-tight truncate text-white">
                    {user.fullName}
                  </h1>
                  {user.nafathVerified && (
                    <span className="text-gold-400" title={t('admin.user.nafathVerified')}>
                      <BadgeCheckIcon size={14} />
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[12px] text-white/65 truncate num">
                  {user.id}
                </div>
              </div>
            </div>
            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              <StatusChip
                size="md"
                tone={statusTone(user.status)}
                dot
                label={t(`admin.users.status.${user.status}`)}
              />
              <StatusChip
                size="sm"
                tone={riskTone(user.riskTier)}
                dot={false}
                label={t(`admin.user.risk.${user.riskTier}`)}
              />
              <span className="inline-flex items-center gap-1 text-[11px] text-white/60">
                <ClockIcon size={11} />
                <span className="num">
                  {t('admin.user.lastActive', {
                    date: formatDate(user.lastActiveAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </span>
              </span>
            </div>
          </div>

          {/* Contact */}
          <Section
            title={t('admin.user.sections.contact')}
            icon={<UserIcon size={14} />}
          >
            <Card padded className="space-y-0">
              <Field
                label={t('admin.user.fields.mobile')}
                value={
                  <span className="inline-flex items-center gap-1.5 num">
                    <PhoneIcon size={12} className="text-ink-400" />
                    {user.mobile}
                  </span>
                }
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.user.fields.email')}
                value={user.email}
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.user.fields.city')}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon size={12} className="text-ink-400" />
                    {user.city}
                  </span>
                }
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.user.fields.createdAt')}
                value={formatDate(user.createdAt)}
                numeric
              />
            </Card>
          </Section>

          {/* Eligibility */}
          <Section
            title={t('admin.user.sections.eligibility')}
            icon={<WalletIcon size={14} />}
          >
            <Card padded className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <MetricTile
                  label={t('admin.user.eligibility.limit')}
                  value={formatCurrency(user.eligibilityLimit)}
                  tone="bg-canvas-100 text-ink-900"
                />
                <MetricTile
                  label={t('admin.user.eligibility.used')}
                  value={formatCurrency(user.usedAmount)}
                  tone="bg-warn-50 text-warn-700"
                />
                <MetricTile
                  label={t('admin.user.eligibility.remaining')}
                  value={formatCurrency(remaining)}
                  tone="bg-success-50 text-success-700"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-ink-500">
                    {t('admin.user.eligibility.utilization')}
                  </span>
                  <span className="num font-semibold text-ink-900">{pct}%</span>
                </div>
                <ProgressBar
                  value={pct}
                  tone={pct > 85 ? 'danger' : pct > 70 ? 'warn' : 'success'}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                <div className="rounded-xl bg-canvas-100 px-3 py-2">
                  <div className="text-ink-400 uppercase tracking-wide text-[10px]">
                    {t('admin.user.eligibility.activeRentals')}
                  </div>
                  <div className="mt-0.5 num font-semibold text-ink-900">
                    {formatNumber(user.activeRentals)}
                  </div>
                </div>
                <div className="rounded-xl bg-canvas-100 px-3 py-2">
                  <div className="text-ink-400 uppercase tracking-wide text-[10px]">
                    {t('admin.user.eligibility.completed')}
                  </div>
                  <div className="mt-0.5 num font-semibold text-ink-900">
                    {formatNumber(user.completedRentals)}
                  </div>
                </div>
              </div>

              <div className="h-px bg-canvas-200/80" />

              <FormField
                label={t('admin.user.eligibility.assignLabel')}
                hint={
                  limitInvalid
                    ? undefined
                    : t('admin.user.eligibility.assignHint', {
                        amount: formatCurrency(user.usedAmount),
                      })
                }
                error={
                  limitInvalid
                    ? t('admin.user.eligibility.belowUsed', {
                        amount: formatCurrency(user.usedAmount),
                      })
                    : undefined
                }
              >
                <Input
                  value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value)}
                  inputMode="numeric"
                  invalid={limitInvalid}
                  leading={<WalletIcon size={14} />}
                  trailing={
                    <span className="text-[11px] text-ink-400">
                      {t('common.sar')}
                    </span>
                  }
                  placeholder="0"
                />
              </FormField>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  10_000, 20_000, 35_000, 60_000,
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLimitDraft(String(preset))}
                    className={cn(
                      'text-[11px] font-semibold rounded-full px-3 h-7 ring-1 ring-inset transition-colors',
                      parsed === preset
                        ? 'bg-ink-900 text-white ring-ink-900'
                        : 'bg-white text-ink-600 hairline hover:bg-canvas-100',
                    )}
                  >
                    <span className="num">{formatCurrency(preset)}</span>
                  </button>
                ))}
              </div>
              <Button
                size="lg"
                block
                leading={<CheckIcon size={16} />}
                onClick={() => void handleSaveLimit()}
                disabled={!canSaveLimit || limitSaving}
                loading={limitSaving}
              >
                {t('admin.user.eligibility.save')}
              </Button>
            </Card>
          </Section>

          {/* Status actions */}
          <Section
            title={t('admin.user.sections.status')}
            icon={<ShieldIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'h-10 w-10 shrink-0 rounded-xl grid place-items-center',
                    user.status === 'active'
                      ? 'bg-success-50 text-success-600'
                      : user.status === 'pending'
                        ? 'bg-warn-50 text-warn-600'
                        : 'bg-danger-50 text-danger-600',
                  )}
                >
                  {user.status === 'suspended' ? (
                    <AlertIcon size={18} />
                  ) : user.status === 'pending' ? (
                    <ClockIcon size={18} />
                  ) : (
                    <BadgeCheckIcon size={18} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink-900">
                    {t(`admin.user.statusBanner.${user.status}.title`)}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-500 leading-relaxed">
                    {t(`admin.user.statusBanner.${user.status}.hint`)}
                  </div>
                </div>
              </div>
              {user.status === 'active' ? (
                <Button
                  variant="danger"
                  size="lg"
                  block
                  leading={<AlertIcon size={16} />}
                  onClick={handleToggleStatus}
                  loading={statusUpdating}
                >
                  {t('admin.user.actions.suspend')}
                </Button>
              ) : (
                <Button
                  size="lg"
                  block
                  leading={<CheckIcon size={16} />}
                  onClick={handleToggleStatus}
                  loading={statusUpdating}
                >
                  {t(
                    user.status === 'pending'
                      ? 'admin.user.actions.activate'
                      : 'admin.user.actions.reactivate',
                  )}
                </Button>
              )}
              {/* Reset is a demo-only convenience — it restores the
                  store's original seeded values for this user. In
                  configured mode there is nothing for it to write
                  back to (the real row was never seeded by us), so
                  the link is hidden to avoid a confusing no-op. */}
              {!configured && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="block w-full text-center text-[12px] text-ink-500 hover:text-ink-700"
                >
                  {t('admin.user.actions.reset')}
                </button>
              )}
            </Card>
          </Section>

          {/* Activity */}
          <Section
            title={t('admin.user.sections.activity')}
            icon={<HistoryIcon size={14} />}
          >
            {recentActivity.length === 0 ? (
              <Card padded className="text-center">
                <div className="mx-auto h-10 w-10 rounded-xl bg-canvas-100 text-ink-500 grid place-items-center">
                  <HistoryIcon size={18} />
                </div>
                <div className="mt-2 text-[13px] font-semibold text-ink-900">
                  {t('admin.user.activity.empty')}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-400">
                  {t('admin.user.activity.emptyHint')}
                </div>
              </Card>
            ) : (
              <Card padded className="space-y-1">
                {recentActivity.map((a, i) => (
                  <div key={a.id}>
                    <ActivityRow
                      item={a}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                      t={t}
                    />
                    {i < recentActivity.length - 1 && (
                      <div className="h-px bg-canvas-200/80" />
                    )}
                  </div>
                ))}
              </Card>
            )}
          </Section>

          <Link
            to="/admin/users"
            className="block text-center text-[12.5px] font-semibold text-gold-700 py-2"
          >
            {t('admin.user.backToList')}
          </Link>

          <div className="rounded-xl2 bg-ink-900 text-white p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white">
              <InfoIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12px] text-white/70 leading-relaxed">
              <div className="text-white font-semibold mb-0.5">
                {t('admin.user.footerNote.title')}
              </div>
              <div>{t('admin.user.footerNote.hint')}</div>
            </div>
          </div>
        </div>

        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div
              role="status"
              className={cn(
                'pointer-events-auto max-w-sm w-full rounded-xl2 px-4 py-3 ring-1 ring-inset shadow-plush flex items-start gap-3',
                toast.tone === 'success' &&
                  'bg-success-50 ring-success-500/25 text-success-700',
                toast.tone === 'danger' &&
                  'bg-danger-50 ring-danger-500/25 text-danger-700',
                toast.tone === 'warn' &&
                  'bg-warn-50 ring-warn-500/25 text-warn-700',
              )}
            >
              <span
                className={cn(
                  'h-8 w-8 shrink-0 rounded-xl grid place-items-center',
                  toast.tone === 'success' && 'bg-success-500/10',
                  toast.tone === 'danger' && 'bg-danger-500/10',
                  toast.tone === 'warn' && 'bg-warn-500/10',
                )}
              >
                {toast.tone === 'success' ? (
                  <CheckIcon size={16} />
                ) : toast.tone === 'danger' ? (
                  <AlertIcon size={16} />
                ) : (
                  <InfoIcon size={16} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{toast.title}</div>
                {toast.hint && (
                  <div className="mt-0.5 text-[11.5px] opacity-80">{toast.hint}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="shrink-0 text-[11px] font-semibold opacity-70"
                aria-label="close"
              >
                <ChevronIcon
                  size={14}
                  className={cn(dir === 'rtl' ? 'rotate-180' : '')}
                />
              </button>
            </div>
          </div>
        )}
      </Screen>

      <ConfirmSheet
        open={suspendConfirmOpen}
        onClose={() => setSuspendConfirmOpen(false)}
        onConfirm={handleConfirmedSuspend}
        title={t('admin.user.confirmSheet.suspend.title')}
        description={t('admin.user.confirmSheet.suspend.description', {
          name: user.fullName,
        })}
        confirmLabel={t('admin.user.actions.suspend')}
        cancelLabel={t('common.cancel')}
        icon={<AlertIcon size={18} />}
        tone="danger"
      />
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <span className="text-ink-500">{icon}</span>
        <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  numeric,
}: {
  label: ReactNode;
  value: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[12px] text-ink-400 shrink-0">{label}</span>
      <span
        className={cn(
          'text-[13px] font-semibold text-ink-900 text-end break-words',
          numeric && 'num',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  tone: string;
}) {
  return (
    <div className={cn('rounded-xl p-2.5', tone)}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-bold num leading-tight truncate">
        {value}
      </div>
    </div>
  );
}

function ActivityRow({
  item,
  formatCurrency,
  formatDate,
  t,
}: {
  item: AdminUserActivity;
  formatCurrency: (n: number) => string;
  formatDate: (d: string | Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          'h-9 w-9 shrink-0 rounded-xl grid place-items-center',
          activityTone(item.type),
        )}
      >
        {activityIcon(item.type)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-ink-900 truncate">
          {item.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400 truncate">
          <span>{t(`admin.user.activity.type.${item.type}`)}</span>
          {item.merchantName && (
            <>
              <span className="text-ink-300">·</span>
              <span className="truncate">{item.merchantName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {typeof item.amount === 'number' && (
          <span className="text-[12px] font-semibold text-ink-900 num">
            {formatCurrency(item.amount)}
          </span>
        )}
        <span className="text-[10.5px] text-ink-400 num">
          {formatDate(item.at)}
        </span>
      </div>
    </div>
  );
}
