import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { ClockIcon, LockIcon } from '@/components/icons';
import {
  useSessionTimeout,
  type SignedOutReason,
} from '@/lib/session/useSessionTimeout';

// =====================================================================
// SessionTimeoutManager — mounts the app-wide session timers (see
// useSessionTimeout) and renders their two dialogs:
//
//   * warning  — the pre-idle-logout countdown with Stay / Sign out.
//   * signedOut — post-logout notice (idle / absolute / expired). Lives
//     here (not on the welcome pages) so it survives the auth redirect
//     without touching any route.
//
// Mounted once in App.tsx inside the i18n + auth providers. Renders
// null in demo/disabled mode and while the session is healthy.
// =====================================================================

export function SessionTimeoutManager() {
  const t = useT();
  const { state, staySignedIn, signOutNow, dismissNotice } = useSessionTimeout();

  if (state.kind === 'warning') {
    return (
      <DialogShell labelId="session-timeout-warning-title">
        <span className="mx-auto h-12 w-12 rounded-2xl bg-warn-50 ring-1 ring-warn-500/25 text-warn-600 grid place-items-center">
          <ClockIcon size={22} />
        </span>
        <h2
          id="session-timeout-warning-title"
          className="mt-4 editorial-title text-[18px] text-ink-900 leading-tight text-center"
        >
          {t('session.timeout.warningTitle')}
        </h2>
        <p className="mt-2 text-[13px] text-ink-500 leading-relaxed text-center">
          {t('session.timeout.warningBody')}
        </p>
        <div
          className="mt-3 rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-4 py-2.5 text-center text-[13px] font-semibold text-ink-900 num"
          aria-live="polite"
        >
          {t('session.timeout.warningCountdown', { seconds: state.secondsLeft })}
        </div>
        <div className="mt-5 space-y-2">
          <Button variant="primary" size="lg" block onClick={staySignedIn}>
            {t('session.timeout.stayCta')}
          </Button>
          <Button variant="ghost" size="md" block onClick={signOutNow}>
            {t('session.timeout.signOutCta')}
          </Button>
        </div>
      </DialogShell>
    );
  }

  if (state.kind === 'signedOut') {
    return (
      <DialogShell labelId="session-signed-out-title">
        <span className="mx-auto h-12 w-12 rounded-2xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-700 grid place-items-center">
          <LockIcon size={22} />
        </span>
        <h2
          id="session-signed-out-title"
          className="mt-4 editorial-title text-[18px] text-ink-900 leading-tight text-center"
        >
          {t(signedOutTitleKey(state.reason))}
        </h2>
        <p className="mt-2 text-[13px] text-ink-500 leading-relaxed text-center">
          {t(signedOutBodyKey(state.reason))}
        </p>
        <div className="mt-5">
          <Button variant="primary" size="lg" block onClick={dismissNotice}>
            {t('session.timeout.signedOut.dismissCta')}
          </Button>
        </div>
      </DialogShell>
    );
  }

  return null;
}

function signedOutTitleKey(reason: SignedOutReason): string {
  if (reason === 'idle') return 'session.timeout.signedOut.idleTitle';
  if (reason === 'absolute') return 'session.timeout.signedOut.absoluteTitle';
  return 'session.timeout.signedOut.expiredTitle';
}

function signedOutBodyKey(reason: SignedOutReason): string {
  if (reason === 'idle') return 'session.timeout.signedOut.idleBody';
  if (reason === 'absolute') return 'session.timeout.signedOut.absoluteBody';
  return 'session.timeout.signedOut.expiredBody';
}

function DialogShell({
  labelId,
  children,
}: {
  labelId: string;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-sm" aria-hidden />
      <div className="relative w-full max-w-[340px] rounded-xl3 bg-white shadow-plush hairline p-6 animate-reveal-up">
        {children}
      </div>
    </div>
  );
}
