// =====================================================================
// MSEGAT provider adapter — SEND-ONLY SMS delivery for the renter OTP.
// =====================================================================
// This module is the SINGLE place that knows MSEGAT's endpoint, field
// names, and response shape. If anything differs from the account's
// Postman documentation after the first real test, correct it HERE
// only — the Edge Function and tests build on these helpers.
//
// Deliberately pure (no Deno globals, no fetch): credentials are
// passed in by the caller, which reads them from Edge Function
// secrets. That keeps the adapter unit-testable from Node and makes
// it impossible for this file to leak env access anywhere else.
//
// MSEGAT is used ONLY to deliver the DB-generated code as a plain SMS
// (sendsms.php). Their hosted OTP endpoints (sendOTPCode/verifyOTPCode)
// are intentionally NOT used: verification must stay in
// merchant_verify_renter_otp so the P0195 offer-issuance gate keeps
// consuming DB challenges.
// =====================================================================

export type MsegatConfig = {
  userName: string;
  apiKey: string;
  userSender: string;
  /** Override for testing/staging; default production gateway. */
  baseUrl?: string;
};

export const MSEGAT_DEFAULT_BASE_URL = 'https://www.msegat.com';
export const MSEGAT_SEND_PATH = '/gw/sendsms.php';

/**
 * Saudi canonical local part (5xxxxxxxx, 9 digits — the app-wide
 * canonical form from normalizeMobile) → MSEGAT `numbers` format:
 * international, digits only, no plus: 9665xxxxxxxx.
 * Returns null for anything that is not a canonical Saudi mobile.
 */
export function toMsegatNumber(canonical: string): string | null {
  if (!/^5\d{8}$/.test(canonical)) return null;
  return `966${canonical}`;
}

/**
 * The OTP SMS body. Kept provider-safe and minimal — MSEGAT OTP/free
 * templates accept the exact wording «رمز التحقق: 1234».
 */
export function buildOtpSmsMessage(code: string): string {
  return `رمز التحقق: ${code}`;
}

export type MsegatSendRequest = {
  url: string;
  /** JSON body for POST — field names per the MSEGAT sendsms API. */
  body: {
    userName: string;
    apiKey: string;
    userSender: string;
    numbers: string;
    msg: string;
    msgEncoding: 'UTF8';
  };
};

export function buildMsegatSendRequest(
  cfg: MsegatConfig,
  msegatNumber: string,
  message: string,
): MsegatSendRequest {
  const base = (cfg.baseUrl ?? MSEGAT_DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    url: `${base}${MSEGAT_SEND_PATH}`,
    body: {
      userName: cfg.userName,
      apiKey: cfg.apiKey,
      userSender: cfg.userSender,
      numbers: msegatNumber,
      msg: message,
      msgEncoding: 'UTF8',
    },
  };
}

// MSEGAT signals success with code "1" (older deployments) or "M0000"
// (newer). Anything else is a provider-side failure; the numeric code
// is safe to log (it identifies auth/sender/balance problems and never
// contains the message or credentials).
export type MsegatOutcome =
  | { ok: true }
  | { ok: false; providerCode: string };

export function parseMsegatResponse(payload: unknown): MsegatOutcome {
  const raw =
    typeof payload === 'object' && payload !== null
      ? (payload as { code?: unknown }).code
      : payload;
  const code = String(raw ?? '').trim();
  if (code === '1' || code.toUpperCase() === 'M0000') return { ok: true };
  return { ok: false, providerCode: code || 'no_code' };
}

/** Log-safe mobile mask: 9665•••••42 — never the full recipient. */
export function maskMsegatNumber(msegatNumber: string): string {
  if (msegatNumber.length < 6) return '•••';
  return `${msegatNumber.slice(0, 4)}•••••${msegatNumber.slice(-2)}`;
}
