// =====================================================================
// OTP service — client-side wrapper around the two Supabase Edge
// Functions (otp-send / otp-verify). Hides the provider entirely so the
// rest of the app calls a single, stable interface.
//
// When env is not configured (local dev without a live backend), the
// helpers throw with a clear "Live backend required" message rather
// than silently no-op.
// =====================================================================

import { requireSupabase } from '@/lib/supabase';
import type { AppRole } from '@/lib/supabase';
import { normalizeMobile } from '@/lib/mobile';

export type OtpSendResult = {
  ok: true;
  /** Diagnostic-only — human-readable masked recipient. Don't display. */
  sentTo?: string;
};

export type OtpVerifiedRenter = {
  id: string;
  full_name: string;
  mobile: string | null;
  city: string | null;
  has_nafath: boolean;
};

export type OtpVerifyResult =
  | { verified: true; renter: OtpVerifiedRenter | null }
  | { verified: false };

export class OtpError extends Error {
  constructor(
    public code:
      | 'invalid_mobile'
      | 'invalid_code'
      | 'twilio_not_configured'
      | 'send_failed'
      | 'verify_failed'
      | 'forbidden'
      | 'unauthorized'
      | 'unknown',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'OtpError';
  }
}

function mapInvokeError(err: unknown): OtpError {
  // supabase-js wraps function errors as `FunctionsHttpError` with a
  // `context.status` and a parsed `context.body`. We pull the
  // `error` string from the response body when present.
  // Avoiding `any` while still being defensive about the shape.
  const anyErr = err as { message?: string; context?: { status?: number; body?: unknown } } | undefined;
  const status = anyErr?.context?.status;
  const body = anyErr?.context?.body as { error?: string } | undefined;
  if (status === 401) return new OtpError('unauthorized', body?.error);
  if (status === 403) return new OtpError('forbidden', body?.error);
  if (body?.error === 'twilio_not_configured') return new OtpError('twilio_not_configured');
  return new OtpError('unknown', anyErr?.message ?? 'OTP request failed');
}

export async function sendOtp(mobileInput: string): Promise<OtpSendResult> {
  const n = normalizeMobile(mobileInput);
  if (!n) throw new OtpError('invalid_mobile');
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<OtpSendResult>('otp-send', {
    body: { mobile: n.canonical },
  });
  if (error) throw mapInvokeError(error);
  if (!data?.ok) throw new OtpError('send_failed');
  return data;
}

export async function verifyOtp(mobileInput: string, code: string): Promise<OtpVerifyResult> {
  const n = normalizeMobile(mobileInput);
  if (!n) throw new OtpError('invalid_mobile');
  const clean = code.replace(/\D/g, '');
  if (clean.length < 4) throw new OtpError('invalid_code');
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<OtpVerifyResult>('otp-verify', {
    body: { mobile: n.canonical, code: clean },
  });
  if (error) throw mapInvokeError(error);
  if (!data) throw new OtpError('verify_failed');
  return data;
}

/**
 * Pre-OTP existence check. Returns ONLY whether a renter with this
 * mobile exists (and a Nafath hint) — no name, no city, nothing
 * identifying. Renter details are exclusively returned by verifyOtp()
 * once Twilio confirms the code.
 *
 * Backed by the lookup_renter_by_mobile RPC.
 */
export type RenterExistenceCheck = {
  id: string;
  has_nafath: boolean;
};

export async function lookupRenterByMobile(
  mobileInput: string,
): Promise<RenterExistenceCheck | null> {
  const n = normalizeMobile(mobileInput);
  if (!n) return null;
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('lookup_renter_by_mobile', {
    p_mobile: n.canonical,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { id: row.id, has_nafath: row.has_nafath } : null;
}

// Re-export role type so callers don't need a second import.
export type { AppRole };
