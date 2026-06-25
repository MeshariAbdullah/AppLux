import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import {
  AlertIcon,
  ChevronIcon,
  GlobeIcon,
  HistoryIcon,
  InfoIcon,
  PhoneIcon,
  ShieldIcon,
  SupportIcon,
  UserIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { requestAccountDeletion, useSupabaseAuth } from '@/lib/supabase';
import { cancelAccountDeletion } from '@/lib/supabase';
import { cn } from '@/lib/cn';

// App Store readiness — three external link / contact env vars surfaced
// in the Profile tab. All are optional in dev (the corresponding row
// hides when its URL is empty) but REQUIRED for any production build
// shipped to App Store / Google Play. See .env.example.
const PRIVACY_URL =
  (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim() || '';
const SUPPORT_URL =
  (import.meta.env.VITE_SUPPORT_URL as string | undefined)?.trim() || '';
const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || '';

export default function Profile() {
  const t = useT();
  const { locale, setLocale, dir, formatDate } = useI18n();
  const { session: demoSession, signOut: demoSignOut } = useStore();
  const {
    configured,
    profile,
    session: realSession,
    signOut: supabaseSignOut,
    refresh,
  } = useSupabaseAuth();
  const navigate = useNavigate();

  const fullName = configured
    ? profile?.full_name ?? realSession?.user?.email ?? '—'
    : demoSession?.fullName ?? '—';
  const email = configured
    ? profile?.email ?? realSession?.user?.email ?? '—'
    : demoSession?.email ?? '—';
  const nafathVerified = configured
    ? Boolean(profile?.nafath_verified_at)
    : Boolean(demoSession?.nafathVerified);
  const deletionRequestedAt = profile?.deletion_requested_at ?? null;

  // ------- Account deletion flow state -------
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletionSubmitting, setDeletionSubmitting] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const onSignOut = async () => {
    if (configured) {
      try {
        await supabaseSignOut();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[lend] signOut failed', err);
      }
    } else {
      demoSignOut();
    }
    navigate('/welcome', { replace: true });
  };

  const onConfirmDelete = async () => {
    setDeletionError(null);
    setDeletionSubmitting(true);
    try {
      if (configured) {
        await requestAccountDeletion();
      }
      setConfirmOpen(false);
      // Sign out so the suspended account can't continue to drive
      // the session. RootRedirect bounces to /welcome.
      await onSignOut();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lend] requestAccountDeletion failed', err);
      setDeletionError(
        err instanceof Error ? err.message : t('profile.deleteAccount.error'),
      );
      setDeletionSubmitting(false);
    }
  };

  const onCancelDeletion = async () => {
    setCancelSubmitting(true);
    try {
      await cancelAccountDeletion();
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lend] cancelAccountDeletion failed', err);
    } finally {
      setCancelSubmitting(false);
    }
  };

  // External links open in a new tab. `noopener,noreferrer` is the
  // safe default — never `target=_blank` without it.
  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Header title={t('profile.title')} />
      <Screen className="bg-canvas">
        {/* Identity card */}
        <Card padded>
          <div className="flex items-center gap-4">
            <Avatar name={fullName !== '—' ? fullName : 'A'} size="lg" tone="gold" />
            <div className="min-w-0">
              <div className="editorial-title text-[17px] text-ink-900 truncate">
                {fullName}
              </div>
              <div className="text-[12.5px] text-ink-400 truncate mt-0.5">{email}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <StatusChip tone="gold" label={t('app.name')} />
                {nafathVerified && (
                  <StatusChip tone="gold" label={t('nafath.verified')} />
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Pending deletion banner — only when a request is on file */}
        {deletionRequestedAt && (
          <Card padded className="bg-warn-50 ring-1 ring-warn-500/30">
            <div className="flex items-start gap-3">
              <span className="h-10 w-10 shrink-0 rounded-2xl bg-white text-warn-700 grid place-items-center ring-1 ring-warn-500/30">
                <AlertIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-warn-700 tracking-tight">
                  {t('profile.deleteAccount.pendingTitle')}
                </div>
                <p className="mt-1 text-[12.5px] text-ink-700 leading-relaxed">
                  {t('profile.deleteAccount.pendingBody', {
                    date: formatDate(deletionRequestedAt),
                  })}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={onCancelDeletion}
                  loading={cancelSubmitting}
                >
                  {cancelSubmitting
                    ? t('profile.deleteAccount.cancelling')
                    : t('profile.deleteAccount.cancelRequest')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Account list — kept for parity with the previous layout. */}
        <div>
          <SectionHeader title={t('profile.accountSection')} />
          <Card padded={false} className="overflow-hidden">
            <Row
              icon={<UserIcon size={18} />}
              tone="lavender"
              label={t('profile.accountEntry')}
              dir={dir}
            />
            <Divider />
            <Row
              icon={<HistoryIcon size={18} />}
              tone="canvas"
              label={t('profile.historyEntry')}
              dir={dir}
              onClick={() => navigate('/contracts')}
            />
          </Card>
        </div>

        {/* Language toggle */}
        <div>
          <SectionHeader title={t('profile.language')} />
          <Card padded={false} className="overflow-hidden">
            <div className="grid grid-cols-2">
              <button
                type="button"
                onClick={() => setLocale('ar')}
                className={cn(
                  'py-4 text-[13.5px] font-medium transition-colors tracking-tight',
                  locale === 'ar'
                    ? 'bg-lavender-400 text-white'
                    : 'text-ink-700 hover:bg-lavender-50',
                )}
              >
                {t('profile.arabic')}
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={cn(
                  'py-4 text-[13.5px] font-medium transition-colors tracking-tight',
                  locale === 'en'
                    ? 'bg-lavender-400 text-white'
                    : 'text-ink-700 hover:bg-lavender-50',
                )}
              >
                {t('profile.english')}
              </button>
            </div>
          </Card>
        </div>

        {/* Support & legal — App Store readiness. Rows are only
            rendered when their corresponding env var is set, so dev
            builds aren't littered with dead links. */}
        {(SUPPORT_EMAIL || SUPPORT_URL || PRIVACY_URL) && (
          <div>
            <SectionHeader title={t('profile.support')} />
            <Card padded={false} className="overflow-hidden">
              {SUPPORT_EMAIL && (
                <>
                  <Row
                    icon={<SupportIcon size={18} />}
                    tone="lavender"
                    label={t('profile.supportEmailLabel')}
                    dir={dir}
                    trailing={
                      <span className="text-[11.5px] text-ink-400 truncate max-w-[140px]">
                        {SUPPORT_EMAIL}
                      </span>
                    }
                    onClick={() => {
                      window.location.href = `mailto:${SUPPORT_EMAIL}`;
                    }}
                  />
                  {(SUPPORT_URL || PRIVACY_URL) && <Divider />}
                </>
              )}
              {SUPPORT_URL && (
                <>
                  <Row
                    icon={<PhoneIcon size={18} />}
                    tone="canvas"
                    label={t('profile.supportPageLabel')}
                    dir={dir}
                    onClick={() => openExternal(SUPPORT_URL)}
                  />
                  {PRIVACY_URL && <Divider />}
                </>
              )}
              {PRIVACY_URL && (
                <Row
                  icon={<ShieldIcon size={18} />}
                  tone="lavender"
                  label={t('profile.privacyPolicy')}
                  dir={dir}
                  onClick={() => openExternal(PRIVACY_URL)}
                />
              )}
            </Card>
          </div>
        )}

        {/* About — single read-only row showing the build version. */}
        <div>
          <SectionHeader title={t('profile.appearance')} />
          <Card padded={false} className="overflow-hidden">
            <Row
              icon={<GlobeIcon size={18} />}
              tone="canvas"
              label={t('profile.language')}
              dir={dir}
              trailing={
                <span className="text-[12px] text-ink-400">
                  {locale === 'ar' ? t('profile.arabic') : t('profile.english')}
                </span>
              }
            />
            <Divider />
            <Row
              icon={<InfoIcon size={18} />}
              tone="canvas"
              label={t('profile.about')}
              dir={dir}
              trailing={
                <span className="text-[12px] text-ink-400 num">
                  {t('profile.version')} 0.1.0
                </span>
              }
            />
          </Card>
        </div>

        {/* Account control — App Store guideline 5.1.1(v) requires
            an in-app account deletion entry point. Suppressed when
            a deletion request is already on file (the banner above
            handles that state). */}
        {!deletionRequestedAt && (
          <div>
            <SectionHeader title={t('profile.dangerSection')} />
            <Card padded={false} className="overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setDeletionError(null);
                  setConfirmOpen(true);
                }}
                className="flex w-full items-start gap-3.5 px-5 py-4 text-start hover:bg-danger-50/50 transition-colors"
              >
                <span className="h-10 w-10 rounded-2xl bg-danger-50 text-danger-600 grid place-items-center shrink-0">
                  <AlertIcon size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-danger-700 tracking-tight">
                    {t('profile.deleteAccount.row')}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-500 leading-relaxed">
                    {t('profile.deleteAccount.rowHint')}
                  </div>
                </div>
                <ChevronIcon
                  size={16}
                  className={cn('text-danger-300 mt-2', dir === 'rtl' && 'rotate-180')}
                />
              </button>
            </Card>
          </div>
        )}

        {deletionError && (
          <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
            {deletionError}
          </div>
        )}

        {/* Sign out — soft lavender outline */}
        <button
          type="button"
          onClick={onSignOut}
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl2 bg-lavender-50 text-lavender-700 font-semibold ring-1 ring-inset ring-lavender-200 hover:bg-lavender-100 transition-colors"
        >
          {t('profile.signOut')}
        </button>

        <p className="text-center text-[11px] text-ink-400 num">
          Lend v0.1.0
        </p>
      </Screen>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onConfirmDelete}
        title={t('profile.deleteAccount.title')}
        description={t('profile.deleteAccount.body')}
        confirmLabel={
          deletionSubmitting
            ? t('profile.deleteAccount.submitting')
            : t('profile.deleteAccount.confirm')
        }
        cancelLabel={t('profile.deleteAccount.cancel')}
        icon={<AlertIcon size={22} />}
        tone="danger"
        loading={deletionSubmitting}
      />
    </>
  );
}

function Divider() {
  return <div className="mx-5 h-px bg-canvas-200/80" />;
}

function Row({
  icon,
  label,
  trailing,
  dir,
  tone = 'canvas',
  onClick,
}: {
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  dir: 'rtl' | 'ltr';
  tone?: 'lavender' | 'canvas';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex w-full items-center gap-3.5 px-5 py-4 text-start transition-colors',
        onClick ? 'hover:bg-lavender-50' : 'cursor-default',
      )}
    >
      <span
        className={cn(
          'h-10 w-10 rounded-2xl grid place-items-center',
          tone === 'lavender'
            ? 'bg-lavender-50 text-lavender-600'
            : 'bg-canvas-100 text-ink-700',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 text-[14px] font-medium text-ink-800 tracking-tight">{label}</span>
      {trailing}
      {onClick && (
        <ChevronIcon size={16} className={cn('text-ink-300', dir === 'rtl' && 'rotate-180')} />
      )}
    </button>
  );
}
