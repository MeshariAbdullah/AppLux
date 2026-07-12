// Type-only import — keeps this module free of runtime dependencies on
// the supabase layer (client.ts imports session/storage.ts, so any
// runtime edge back into supabase would be a cycle).
import type { AppRole } from '@/lib/supabase/types';

// =====================================================================
// Session timeout policy — Phase 1 of the NFR hardening plan.
//
// All values are client-enforced. Supabase JWT lifetime is a separate,
// server-side control; these timers sign the user out of the app well
// before any token concern matters, scaled by how sensitive the role's
// screens are:
//
//   * admin sees full customer PII (including National ID) — shortest.
//   * merchant operates a shared counter device — mid.
//   * customer is on their own phone — most lenient.
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

const MINUTE = 60_000;
const HOUR = 3_600_000;

export const SESSION_POLICIES: Record<AppRole, SessionTimeoutPolicy> = {
  customer: { idleMs: 30 * MINUTE, absoluteMs: 24 * HOUR, warningMs: 60_000 },
  merchant: { idleMs: 20 * MINUTE, absoluteMs: 12 * HOUR, warningMs: 60_000 },
  admin: { idleMs: 10 * MINUTE, absoluteMs: 4 * HOUR, warningMs: 60_000 },
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
