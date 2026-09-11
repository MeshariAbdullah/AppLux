// =====================================================================
// Registration OTP — first-time signup mobile verification.
// =====================================================================
// COMPLETELY SEPARATE from the renter/session OTP (src/lib/otp/index):
// its own Edge Functions (registration-otp-send / -verify), its own
// challenge table, its own flag — so signup verification and rental
// verification are enabled/disabled independently. The backend MSEGAT
// credentials are SHARED (same secrets), the features are not.
//
// Verification is OURS: registration-otp-verify checks the code
// against the DB hash (registration_otp_check); on success the
// challenge is marked verified server-side and consumed at account
// creation, stamping profiles.mobile_verified_at (20260502125600).
// MSEGAT only delivers the SMS.
//
// What a success MEANS: control of the mobile at signup time was
// confirmed. Not a National ID / government identity verification.
// =====================================================================

import { requireSupabase } from '@/lib/supabase';
import { normalizeMobile } from '@/lib/mobile';
import { buildTimeOtpEnv, resolveRegistrationOtpEnabled } from './flags';

/** Signup shows the mobile-verification step only when this is true. */
export function isRegistrationOtpEnabled(): boolean {
  return resolveRegistrationOtpEnabled(buildTimeOtpEnv());
}

export class RegistrationOtpError extends Error {
  constructor(
    public code:
      | 'invalid_mobile'
      | 'cooldown'
      | 'send_limit'
      | 'no_active_challenge'
      | 'too_many_attempts'
      | 'otp_not_configured'
      | 'sms_send_failed'
      | 'send_failed'
      | 'verify_failed'
      | 'unknown',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RegistrationOtpError';
  }
}

function mapInvokeError(err: unknown): RegistrationOtpError {
  const anyErr = err as { message?: string; context?: { body?: unknown } } | undefined;
  const body = anyErr?.context?.body as { error?: string } | undefined;
  switch (body?.error) {
    case 'invalid_mobile': return new RegistrationOtpError('invalid_mobile');
    case 'cooldown': return new RegistrationOtpError('cooldown');
    case 'send_limit': return new RegistrationOtpError('send_limit');
    case 'no_active_challenge': return new RegistrationOtpError('no_active_challenge');
    case 'too_many_attempts': return new RegistrationOtpError('too_many_attempts');
    case 'otp_not_configured': return new RegistrationOtpError('otp_not_configured');
    case 'sms_send_failed': return new RegistrationOtpError('sms_send_failed');
    default:
      return new RegistrationOtpError('unknown', anyErr?.message ?? 'Registration OTP failed');
  }
}

/** Texts a 6-digit code to the mobile being registered (60s resend
 *  cooldown and hourly cap enforced server-side). */
export async function sendRegistrationOtp(mobileInput: string): Promise<void> {
  const n = normalizeMobile(mobileInput);
  if (!n) throw new RegistrationOtpError('invalid_mobile');
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<{ ok?: boolean }>(
    'registration-otp-send',
    { body: { mobile: n.canonical } },
  );
  if (error) throw mapInvokeError(error);
  if (!data?.ok) throw new RegistrationOtpError('send_failed');
}

/** Checks the code. False = wrong code (attempt counted server-side);
 *  expiry/attempt-cap conditions throw with their specific code. */
export async function verifyRegistrationOtp(
  mobileInput: string,
  code: string,
): Promise<boolean> {
  const n = normalizeMobile(mobileInput);
  if (!n) throw new RegistrationOtpError('invalid_mobile');
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<{ verified?: boolean }>(
    'registration-otp-verify',
    { body: { mobile: n.canonical, code: clean } },
  );
  if (error) throw mapInvokeError(error);
  if (typeof data?.verified !== 'boolean') throw new RegistrationOtpError('verify_failed');
  return data.verified;
}
