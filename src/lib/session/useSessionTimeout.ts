import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase, useSupabaseAuth } from '@/lib/supabase';
import { resolveSessionPolicy } from './policy';
import {
  LAST_ACTIVITY_AT_KEY,
  SESSION_STARTED_AT_KEY,
  readTimestamp,
  writeTimestamp,
} from './storage';
import { isSensitiveFlowActive } from './flowGuard';

// =====================================================================
// useSessionTimeout — Phase 1 session hardening.
//
// One instance is mounted app-wide (SessionTimeoutManager). It enforces
// the role-keyed idle + absolute timeouts from ./policy.ts:
//
//   * Idle: derived from the last user interaction (pointerdown /
//     keydown). A 60s warning modal precedes the logout; interactions
//     during the warning are deliberately ignored — the user must
//     explicitly choose "Stay signed in" so a stray tap can't silently
//     extend the session.
//   * Absolute: hard cap anchored at sign-in (lend.session.startedAt,
//     set-if-missing so it survives app restarts and is wiped by the
//     sign-out sweep). Not deferred by sensitive flows.
//   * Sensitive flows (see ./flowGuard.ts) defer idle warning + logout;
//     an idle deadline that passes mid-flow fires right after the flow
//     completes.
//   * Foreground (visibilitychange → visible): both timers re-checked
//     against the persisted anchors — a night in the iOS app switcher
//     can't outlive the idle window — then the Supabase session is
//     revalidated via getSession(), which auto-refreshes a token close
//     to expiry. An invalid/expired session signs out with a notice.
//
// Anchors persist in localStorage so a killed-and-relaunched app still
// enforces the timers. Both keys live under `lend.*` and are removed by
// the sign-out sweep, so the next sign-in starts fresh.
//
// The hook never calls mutation RPCs — sign-out is the only action it
// takes, and the auth listener + RequireRole handle the redirect.
// =====================================================================

export type SignedOutReason = 'idle' | 'absolute' | 'expired';

export type SessionTimeoutState =
  | { kind: 'inactive' }
  | { kind: 'active' }
  | { kind: 'warning'; secondsLeft: number }
  | { kind: 'signedOut'; reason: SignedOutReason };

/** Throttle for persisting the idle anchor — keeps writes rare while
 *  bounding the restart-enforcement error to a few seconds. */
const ACTIVITY_PERSIST_INTERVAL_MS = 10_000;

export function useSessionTimeout(): {
  state: SessionTimeoutState;
  /** "Stay signed in" — resets the idle window, dismisses the warning. */
  staySignedIn: () => void;
  /** "Sign out now" — immediate, user-chosen (no post-logout notice). */
  signOutNow: () => void;
  /** Dismiss the post-logout notice. */
  dismissNotice: () => void;
} {
  const { configured, status, role, session, signOut } = useSupabaseAuth();
  const enabled = configured && status === 'authenticated';
  const userId = session?.user?.id ?? null;

  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);
  const [notice, setNotice] = useState<SignedOutReason | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const lastPersistRef = useRef<number>(0);
  const startedAtRef = useRef<number | null>(null);
  const warningRef = useRef(false);
  const signingOutRef = useRef(false);

  warningRef.current = warningSecondsLeft !== null;

  const performSignOut = useCallback(
    async (reason: SignedOutReason | null) => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      setWarningSecondsLeft(null);
      if (reason) setNotice(reason);
      try {
        // signOut() is hardened in auth.ts: a failed global sign-out
        // falls back to local sign-out, and the storage sweep always
        // runs. RequireRole redirects on the resulting auth flip.
        await signOut();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[lend] session-timeout sign-out failed', err);
      } finally {
        signingOutRef.current = false;
      }
    },
    [signOut],
  );

  // Seed the anchors whenever an authenticated user appears. startedAt
  // is set-if-missing (sign-out sweeps it, so "missing" means a fresh
  // sign-in — restarts within the same session keep the original
  // anchor). lastActivity prefers the persisted value so time spent
  // killed/backgrounded counts as idle.
  useEffect(() => {
    if (!enabled || !userId) return;
    const now = Date.now();
    const startedAt = readTimestamp(SESSION_STARTED_AT_KEY);
    if (startedAt && startedAt <= now) {
      startedAtRef.current = startedAt;
    } else {
      startedAtRef.current = now;
      writeTimestamp(SESSION_STARTED_AT_KEY, now);
    }
    const lastActivity = readTimestamp(LAST_ACTIVITY_AT_KEY);
    lastActivityRef.current = lastActivity && lastActivity <= now ? lastActivity : now;
    writeTimestamp(LAST_ACTIVITY_AT_KEY, lastActivityRef.current);
    lastPersistRef.current = now;
  }, [enabled, userId]);

  // Timers + activity + foreground revalidation. One effect so the
  // whole enforcement surface is auditable in a single place.
  useEffect(() => {
    if (!enabled) {
      setWarningSecondsLeft(null);
      return;
    }
    const policy = resolveSessionPolicy(role);

    const onActivity = () => {
      // During the warning the modal owns the decision — a tap must not
      // silently reset the idle window.
      if (warningRef.current || signingOutRef.current) return;
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastPersistRef.current >= ACTIVITY_PERSIST_INTERVAL_MS) {
        writeTimestamp(LAST_ACTIVITY_AT_KEY, now);
        lastPersistRef.current = now;
      }
    };

    const check = () => {
      if (signingOutRef.current) return;
      const now = Date.now();

      // Absolute cap — hard limit, not deferred by sensitive flows.
      const startedAt = startedAtRef.current;
      if (startedAt && now - startedAt >= policy.absoluteMs) {
        void performSignOut('absolute');
        return;
      }

      const idleAt = lastActivityRef.current + policy.idleMs;

      // Sensitive flow → defer idle warning AND logout. The next tick
      // after the flow releases re-evaluates and enforces.
      if (isSensitiveFlowActive()) {
        setWarningSecondsLeft(null);
        return;
      }

      if (now >= idleAt) {
        void performSignOut('idle');
        return;
      }
      if (now >= idleAt - policy.warningMs) {
        setWarningSecondsLeft(Math.ceil((idleAt - now) / 1000));
        return;
      }
      setWarningSecondsLeft(null);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // Enforce the persisted timers first — if the idle/absolute
      // window elapsed while backgrounded, this signs out immediately
      // with the friendly notice.
      check();
      if (signingOutRef.current) return;
      // Then revalidate with Supabase. getSession() transparently
      // refreshes a token that expired while iOS froze the auto-refresh
      // timer. A null session here means the server no longer honours
      // us — sign out with the "expired" notice (the sweep clears any
      // leftover local state).
      const sb = getSupabase();
      if (!sb) return;
      void sb.auth
        .getSession()
        .then(({ data, error }) => {
          if (error || !data.session) void performSignOut('expired');
        })
        .catch(() => {
          // Network failure on foreground is NOT a sign-out signal —
          // the offline banner covers it; timers keep running.
        });
    };

    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(check, 1000);
    check();

    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [enabled, role, performSignOut]);

  const staySignedIn = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    writeTimestamp(LAST_ACTIVITY_AT_KEY, now);
    lastPersistRef.current = now;
    setWarningSecondsLeft(null);
  }, []);

  const signOutNow = useCallback(() => {
    void performSignOut(null);
  }, [performSignOut]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const state: SessionTimeoutState = notice
    ? { kind: 'signedOut', reason: notice }
    : !enabled
      ? { kind: 'inactive' }
      : warningSecondsLeft !== null
        ? { kind: 'warning', secondsLeft: warningSecondsLeft }
        : { kind: 'active' };

  return { state, staySignedIn, signOutNow, dismissNotice };
}
