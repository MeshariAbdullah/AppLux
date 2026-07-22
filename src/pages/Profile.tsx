import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { Button, ConfirmSheet, StatusChip } from '@/components/ui';
import { AlertIcon, ChevronIcon } from '@/components/icons';
import { translateError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { releaseInfo } from '@/lib/releaseInfo';
import { useTapReveal } from '@/lib/useTapReveal';
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
  // Phase 6C hidden diagnostics gesture — seven taps on the version row.
  const tapVersion = useTapReveal(() => navigate('/diagnostics'));

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
        logEvent('rpc_failure', 'warn', { op: 'sign_out' }, err);
      }
    } else {
      demoSignOut();
    }
    navigate('/welcome', { replace: true });
  };

  const onConfirmDelete = async () => {
    if (deletionSubmitting) return;
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
      logEvent('auth_failure', 'warn', { op: 'request_account_deletion' }, err);
      // Business blockers (P0130-P0133) get dedicated copy via
      // translateError; anything unexpected — including PGRST202 when
      // the RPC is missing server-side — falls back to the generic
      // deletion message. Never a raw code on screen. Close the sheet
      // so the banner underneath is actually visible; the account
      // stays signed in and untouched.
      setDeletionError(translateError(err, t, 'errors.deletionUnavailable'));
      setConfirmOpen(false);
      setDeletionSubmitting(false);
    }
  };

  const onCancelDeletion = async () => {
    setCancelSubmitting(true);
    try {
      await cancelAccountDeletion();
      await refresh();
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'cancel_account_deletion' }, err);
    } finally {
      setCancelSubmitting(false);
    }
  };

  // External links open in a new tab. `noopener,noreferrer` is the
  // safe default — never `target=_blank` without it.
  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const languageValue = locale === 'ar' ? t('profile.arabic') : t('profile.english');

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+22px)] pb-24 space-y-4">
          {/* ====== C13 masthead ====== */}
          <div className="flex items-center gap-3.5">
            <span className="h-14 w-14 shrink-0 rounded-full bg-navy-700 text-white grid place-items-center text-[19px] font-bold">
              {(fullName !== '—' ? fullName : 'A').trim().charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-bold text-navy-700 truncate">
                {fullName}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-500 truncate" dir="ltr">
                {email}
              </div>
            </div>
            {nafathVerified && (
              <StatusChip
                size="sm"
                tone="success"
                dot={false}
                label={t('nafath.verified')}
              />
            )}
          </div>

          {/* Pending deletion banner — only when a request is on file */}
          {deletionRequestedAt && (
            <div className="rounded-[14px] bg-warn-50 ring-1 ring-warn-500/25 px-[18px] py-4">
              <div className="text-[13px] font-bold text-warn-700">
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
          )}

          {/* ====== Card A — account rows (C13 icon-less rows) ====== */}
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px]">
            <Row label={t('profile.accountEntry')} dir={dir} />
            <Divider />
            <Row
              label={t('profile.historyEntry')}
              dir={dir}
              onClick={() => navigate('/contracts')}
            />
            <Divider />
            <Row
              label={t('profile.accountStatusLabel')}
              dir={dir}
              trailing={
                <span className="text-[12.5px] font-bold text-green-700">
                  {t('profile.accountStatusActive')}
                </span>
              }
            />
            <Divider />
            {/* Language — C13 row form; tapping toggles AR ↔ EN (same
                capability as the previous segmented control). */}
            <Row
              label={t('profile.language')}
              dir={dir}
              trailing={
                <span className="text-[12.5px] text-ink-500">{languageValue}</span>
              }
              onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            />
            {PRIVACY_URL && (
              <>
                <Divider />
                <Row
                  label={t('profile.privacyPolicy')}
                  dir={dir}
                  onClick={() => openExternal(PRIVACY_URL)}
                />
              </>
            )}
          </div>

          {/* ====== Card B — support + account control ====== */}
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px]">
            {SUPPORT_EMAIL && (
              <>
                <Row
                  label={t('profile.supportEmailLabel')}
                  dir={dir}
                  trailing={
                    <span className="text-[11.5px] text-ink-400 truncate max-w-[150px]" dir="ltr">
                      {SUPPORT_EMAIL}
                    </span>
                  }
                  onClick={() => {
                    window.location.href = `mailto:${SUPPORT_EMAIL}`;
                  }}
                />
                {(SUPPORT_URL || !deletionRequestedAt) && <Divider />}
              </>
            )}
            {SUPPORT_URL && (
              <>
                <Row
                  label={t('profile.supportPageLabel')}
                  dir={dir}
                  onClick={() => openExternal(SUPPORT_URL)}
                />
                {!deletionRequestedAt && <Divider />}
              </>
            )}
            {/* Account deletion — App Store guideline 5.1.1(v) entry
                point; suppressed while a request is pending. */}
            {!deletionRequestedAt && (
              <Row
                label={t('profile.deleteAccount.row')}
                dir={dir}
                danger
                onClick={() => {
                  setDeletionError(null);
                  setConfirmOpen(true);
                }}
              />
            )}
          </div>

          {deletionError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
              {deletionError}
            </div>
          )}

          {/* Sign out — outlined navy (M16-family pattern) */}
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center justify-center h-13 w-full rounded-xl2 bg-white text-navy-700 font-bold text-[14px] ring-[1.5px] ring-inset ring-navy-700 hover:bg-navy-50 transition-colors"
          >
            {t('profile.signOut')}
          </button>

          {/* Version line — seven taps still open /diagnostics (6C
              gesture; the full release metadata — commit + environment
              — now lives ONLY on the diagnostics page, never in the
              visible UI). */}
          <button
            type="button"
            onClick={tapVersion}
            className="w-full text-center text-[11px] text-ink-400 cursor-default select-none"
          >
            {t('profile.versionLine', { version: releaseInfo.version })}
          </button>
        </div>
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
  return <div className="h-px bg-beige-100" />;
}

// C13 rows — no leading icon boxes: label (start) + value + chevron.
function Row({
  label,
  trailing,
  dir,
  onClick,
  danger = false,
}: {
  label: ReactNode;
  trailing?: ReactNode;
  dir: 'rtl' | 'ltr';
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex w-full items-center gap-3 py-3.5 text-start transition-colors',
        onClick ? 'hover:bg-beige-50' : 'cursor-default',
      )}
    >
      <span
        className={cn(
          'flex-1 text-[13.5px] font-semibold tracking-tight',
          danger ? 'text-danger-600' : 'text-ink-800',
        )}
      >
        {label}
      </span>
      {trailing}
      {onClick && (
        <ChevronIcon
          size={14}
          className={cn(
            danger ? 'text-danger-400' : 'text-ink-300',
            dir === 'rtl' && 'rotate-180',
          )}
        />
      )}
    </button>
  );
}
