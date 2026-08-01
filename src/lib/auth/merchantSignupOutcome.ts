import type { Session, User } from '@supabase/supabase-js';

// =====================================================================
// classifyMerchantSignup — turn a Supabase auth.signUp() result into the
// ONE correct next step, mirroring the proven customer logic
// (Register.tsx). This is the guard against falsely telling a merchant
// "we sent you a code" when Supabase actually sent nothing.
//
//   'active'  — a session was returned (Confirm-Email disabled, or the
//               address was already an unconfirmed one that auto-signed
//               in). Go straight to the pending screen.
//   'confirm' — no session BUT user.identities is non-empty. This is the
//               documented evidence of a genuinely new (or existing
//               UNCONFIRMED) account: GoTrue emailed the confirmation
//               code. Show the OTP screen.
//   'exists'  — no session AND identities is empty/absent. With Confirm
//               Email ON, Supabase OBFUSCATES a signup against an
//               already-CONFIRMED address: no error, a fake user, an
//               EMPTY identities array, and NO email dispatched. Never
//               claim a code was sent — show a friendly "sign in" error.
// =====================================================================

export type MerchantSignupOutcome = 'active' | 'confirm' | 'exists';

export function classifyMerchantSignup(result: {
  user: User | null;
  session: Session | null;
}): MerchantSignupOutcome {
  if (result.session?.user) return 'active';
  if ((result.user?.identities?.length ?? 0) > 0) return 'confirm';
  return 'exists';
}
