// =====================================================================
// OTP service — the SINGLE client abstraction for customer-presence
// verification in the merchant rental session. Everything outside this
// module calls `sendOtp` / `verifyOtp` and never knows which provider
// is behind them.
//
// Providers:
//
//   'rpc-inapp' (CURRENT DEFAULT — pending SMS integration):
//     Backed by the merchant_start_renter_otp /
//     merchant_verify_renter_otp SECURITY DEFINER RPCs
//     (20260502125100). The server generates a cryptographically
//     random 6-digit code per challenge; while no SMS provider is
//     integrated, the code is DELIVERED IN-APP — the CUSTOMER
//     retrieves it inside their own authenticated Lend session
//     (get_my_renter_otp / getMyRenterOtp below) and reads it to the
//     merchant. There is NO fixed code and NO bypass: the merchant
//     side never learns the code from the server, and this client
//     contains no code either. Offer issuance is additionally
//     enforced server-side (P0195): without a verified challenge the
//     invoice INSERT is rejected regardless of UI state.
//
//   'twilio-edge' (the SMS seam):
//     The pre-existing otp-send / otp-verify Supabase Edge Functions
//     (Twilio Verify). Activate by setting VITE_OTP_PROVIDER=twilio-edge
//     at build time AND deploying the edge functions with the Twilio
//     secrets. Same request/response shape — no UI change needed.
//     NOTE: until the server-side issuance gate is pointed at the
//     Twilio verification result, keep the RPC provider — the P0195
//     gate consumes RPC challenges.
//
// What a successful verification MEANS (be precise — see the product
// terminology decision): "control/presence of the customer's registered
// Lend account/mobile was confirmed for this in-store session." It is
// NOT a National ID verification and NOT a government identity
// verification.
// =====================================================================

import { requireSupabase } from '@/lib/supabase';
import type { AppRole, LocalizedJson } from '@/lib/supabase';
import { normalizeMobile } from '@/lib/mobile';

type OtpProvider = 'rpc-inapp' | 'twilio-edge';

/** Build-time provider selection. Defaults to the in-app RPC provider;
 *  flip to 'twilio-edge' when the real SMS integration ships. */
function resolveProvider(): OtpProvider {
  return import.meta.env.VITE_OTP_PROVIDER === 'twilio-edge'
    ? 'twilio-edge'
    : 'rpc-inapp';
}

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
      | 'no_customer'
      | 'no_active_challenge'
      | 'too_many_attempts'
      | 'throttled'
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

// ---------------------------------------------------------------------
// rpc-inapp provider (default until SMS delivery ships)
// ---------------------------------------------------------------------

function mapRpcError(err: unknown): OtpError {
  const code = (err as { code?: unknown })?.code;
  const message = (err as { message?: string })?.message;
  if (code === 'P0030') return new OtpError('forbidden', message);
  if (code === '42501') return new OtpError('unauthorized', message);
  if (code === 'P0190') return new OtpError('invalid_mobile', message);
  if (code === 'P0191') return new OtpError('no_customer', message);
  if (code === 'P0192') return new OtpError('throttled', message);
  if (code === 'P0193') return new OtpError('no_active_challenge', message);
  if (code === 'P0194') return new OtpError('too_many_attempts', message);
  return new OtpError('unknown', message ?? 'OTP request failed');
}

async function sendOtpViaRpc(canonicalMobile: string): Promise<OtpSendResult> {
  const sb = requireSupabase();
  const { error } = await sb.rpc('merchant_start_renter_otp', {
    p_mobile: canonicalMobile,
  });
  if (error) throw mapRpcError(error);
  return { ok: true };
}

async function verifyOtpViaRpc(
  canonicalMobile: string,
  code: string,
): Promise<OtpVerifyResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('merchant_verify_renter_otp', {
    p_mobile: canonicalMobile,
    p_code: code,
  });
  if (error) throw mapRpcError(error);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { verified: false }; // wrong code (attempt counted server-side)
  return {
    verified: true,
    renter: {
      id: row.id,
      full_name: row.full_name,
      mobile: row.mobile,
      city: row.city,
      has_nafath: row.has_nafath,
    },
  };
}

// ---------------------------------------------------------------------
// twilio-edge provider (production seam — pre-existing edge functions)
// ---------------------------------------------------------------------

function mapInvokeError(err: unknown): OtpError {
  // supabase-js wraps function errors as `FunctionsHttpError` with a
  // `context.status` and a parsed `context.body`.
  const anyErr = err as { message?: string; context?: { status?: number; body?: unknown } } | undefined;
  const status = anyErr?.context?.status;
  const body = anyErr?.context?.body as { error?: string } | undefined;
  if (status === 401) return new OtpError('unauthorized', body?.error);
  if (status === 403) return new OtpError('forbidden', body?.error);
  if (body?.error === 'twilio_not_configured') return new OtpError('twilio_not_configured');
  return new OtpError('unknown', anyErr?.message ?? 'OTP request failed');
}

async function sendOtpViaEdge(canonicalMobile: string): Promise<OtpSendResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<OtpSendResult>('otp-send', {
    body: { mobile: canonicalMobile },
  });
  if (error) throw mapInvokeError(error);
  if (!data?.ok) throw new OtpError('send_failed');
  return data;
}

async function verifyOtpViaEdge(
  canonicalMobile: string,
  code: string,
): Promise<OtpVerifyResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke<OtpVerifyResult>('otp-verify', {
    body: { mobile: canonicalMobile, code },
  });
  if (error) throw mapInvokeError(error);
  if (!data) throw new OtpError('verify_failed');
  return data;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/** Issues a one-time code for the customer registered under this
 *  mobile. Merchant/admin-only server-side. */
export async function sendOtp(mobileInput: string): Promise<OtpSendResult> {
  const n = normalizeMobile(mobileInput);
  if (!n) throw new OtpError('invalid_mobile');
  return resolveProvider() === 'twilio-edge'
    ? sendOtpViaEdge(n.canonical)
    : sendOtpViaRpc(n.canonical);
}

/** Checks the code the customer provided. On success returns the
 *  customer's safe profile fields (name / mobile / city) — the same
 *  disclosure boundary as before: nothing identifying is revealed to
 *  the merchant until verification succeeds. */
export async function verifyOtp(mobileInput: string, code: string): Promise<OtpVerifyResult> {
  const n = normalizeMobile(mobileInput);
  if (!n) throw new OtpError('invalid_mobile');
  const clean = code.replace(/\D/g, '');
  if (clean.length < 4) throw new OtpError('invalid_code');
  return resolveProvider() === 'twilio-edge'
    ? verifyOtpViaEdge(n.canonical, clean)
    : verifyOtpViaRpc(n.canonical, clean);
}

/**
 * Pre-OTP existence check. Returns ONLY whether a customer with this
 * mobile exists (and a Nafath hint) — no name, no city, nothing
 * identifying. Customer details are exclusively returned by verifyOtp()
 * once the code checks out.
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
  return row
    ? {
        id: row.id,
        has_nafath: row.has_nafath,
      }
    : null;
}

// ---------------------------------------------------------------------
// Customer side — in-app code delivery (rpc-inapp provider only)
// ---------------------------------------------------------------------

export type PendingRenterOtp = {
  /** The one-time code the customer reads to the merchant. */
  code: string;
  /** Server-side deadline for entering the code. */
  expiresAt: string;
  /** Requesting boutique's display name ({ar,en}) when resolvable. */
  merchantName: LocalizedJson | null;
};

/**
 * The CUSTOMER's own pending verification code, if any. Backed by the
 * get_my_renter_otp RPC, which is strictly scoped to auth.uid() — this
 * is the in-app delivery channel while SMS is not integrated. Returns
 * null when no code is pending (or when the caller isn't signed in as
 * the customer the challenge targets).
 */
export async function getMyRenterOtp(): Promise<PendingRenterOtp | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('get_my_renter_otp');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row
    ? {
        code: row.code,
        expiresAt: row.expires_at,
        merchantName: (row.merchant_name as LocalizedJson | null) ?? null,
      }
    : null;
}

// Re-export role type so callers don't need a second import.
export type { AppRole };
