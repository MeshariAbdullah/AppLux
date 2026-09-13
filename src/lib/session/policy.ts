// Type-only import — keeps this module free of runtime dependencies on
// the supabase layer (client.ts imports session/storage.ts, so any
// runtime edge back into supabase would be a cycle).
import type { AppRole } from '@/lib/supabase/types';

// =====================================================================
// Session timeout policy.
//
// All values are client-enforced. Supabase persists the session via
// rotating refresh tokens (persistSession + autoRefreshToken in
// client.ts), so the server keeps honouring the session indefinitely
// by default; these timers are the app's own cap on how long a
// sign-in lives.
//
// PRODUCT DECISION (session-duration spec): users stay signed in for
// up to TEN DAYS before the app requires a fresh login — the earlier
// short idle/absolute windows (minutes/hours) forced constant
// re-logins on the phone app. Both timers now enforce exactly that
// 10-day ceiling for every role:
//
//   * absolute — hard cap 10 days from sign-in, however active.
//   * idle     — also 10 days: within the allowed window, coming back
//     to the app must NOT require a login. The idle machinery
//     (activity anchors, warning modal, sensitive-flow deferral)
//     stays in place so the window can be narrowed per-role again by
//     changing only these values.
//
// Everything else that protects the account is unchanged: sign-out
// (user-chosen or timer-driven) still revokes the token and sweeps
// all app storage, and every app foreground still revalidates the
// session with the server (useSessionTimeout) — a revoked/expired
// session signs out immediately with the "expired" notice.
//
// The warning window is the countdown modal shown BEFORE idle logout.
// Absolute timeout is a hard cap from sign-in regardless of activity;
// it fires without a countdown (the post-logout notice explains why).
// =====================================================================

export type SessionTimeoutPolicy = {
  /** Idle window — signed out this long after the last interaction. */
  idleMs: number;
  /** Hard cap from sign-in, regardless of activity. */
  absoluteMs: number;
  /** How long before idle logout the warning modal appears. */
  warningMs: number;
};

const DAY = 86_400_000;

/** The one product knob: maximum session lifetime before re-login. */
export const SESSION_MAX_DAYS = 10;

export const SESSION_POLICIES: Record<AppRole, SessionTimeoutPolicy> = {
  customer: {
    idleMs: SESSION_MAX_DAYS * DAY,
    absoluteMs: SESSION_MAX_DAYS * DAY,
    warningMs: 60_000,
  },
  merchant: {
    idleMs: SESSION_MAX_DAYS * DAY,
    absoluteMs: SESSION_MAX_DAYS * DAY,
    warningMs: 60_000,
  },
  admin: {
    idleMs: SESSION_MAX_DAYS * DAY,
    absoluteMs: SESSION_MAX_DAYS * DAY,
    warningMs: 60_000,
  },
};

/**
 * Policy for the current role. While the profile row is still loading
 * (role === null) we fall back to the CUSTOMER policy — the most
 * lenient — so a slow profile fetch can never idle-logout an admin
 * faster than their real policy allows. The correct policy applies as
 * soon as the role resolves.
 */
export function resolveSessionPolicy(role: AppRole | null): SessionTimeoutPolicy {
  return SESSION_POLICIES[role ?? 'customer'];
}
