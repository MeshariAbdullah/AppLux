// =====================================================================
// translateError — Phase 2 error hygiene. Single place that turns a
// caught backend/network error into calm, translated, user-safe copy.
//
// Why: several handlers used to surface raw `err.message` — Postgres
// constraint names, column names, provider phrasing — straight into
// the UI, English-only. This helper classifies the error and returns
// an i18n string instead. The raw error should still be reported at
// the call site via logEvent() (Phase 6A — sanitized, with a support
// id) so diagnosis stays possible; only the USER copy is translated.
//
// Classification sources:
//   * Our SECURITY DEFINER RPCs raise with explicit errcodes in the
//     P00xx range (see supabase/migrations/*.sql). Authorization
//     guards and validation guards get distinct copy.
//   * P0001 is Postgres's default RAISE code — every current P0001 in
//     our migrations is a state-machine guard ("Invoice is not in an
//     acceptable state", "Note must be signed before verification"),
//     i.e. the action was already done or is no longer available.
//   * Standard Postgres/PostgREST codes for permission, uniqueness,
//     and timeout.
//   * Network failures (fetch rejection / navigator offline).
//
// The generic fallback appends the machine `code` when one exists —
// codes are non-sensitive and give support something to search for,
// alongside the LND- support ids added in Phase 6A (withSupportId).
// =====================================================================

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
};

/** RPC guard codes that mean "you are not allowed to do this". */
const RPC_UNAUTHORIZED_CODES = new Set([
  'P0002', // accept_rental_invoice — not your invoice
  'P0010', // provision_merchant_from_application — admin only
  'P0021', // close_rental_contract — not owner/admin
  'P0030', // lookup/confirm/eligibility — merchant/admin only
  'P0031', // record_rental_payment — not your invoice
  'P0041', // record_nafath_signing — not your note
  'P0042', // record_contract_handover — not contract customer
  'P0051', // verify_and_activate_rental — not your note
  'P0072', // request_account_deletion — customers only
  'P0080', // merchant_set_customer_national_id — not authenticated
  'P0081', // merchant_set_customer_national_id — not authorised
  'P0085', // merchant_set_customer_national_id — target not customer
  'P0100', // profiles guard — role/account_status self-change blocked
  'P0112', // receipt photos — not the contract customer
]);

/** Receipt-photo flow (Bugs 17/19) — codes with dedicated copy so the
 *  customer knows exactly which product rule stopped the action. */
const RECEIPT_PHOTO_CODES: Record<string, string> = {
  P0113: 'errors.receiptPhotosLocked', // confirmed → immutable
  P0115: 'errors.receiptPhotosMax', // 4-photo cap reached
  P0116: 'errors.receiptPhotosMin', // confirm needs ≥1 photo
  P0117: 'errors.receiptPhotosConfirmRequired', // activation gate
};

/** RPC guard codes that mean "the submitted details are invalid". */
const RPC_VALIDATION_CODES = new Set([
  'P0082', // invalid National ID format
  'P0083', // invalid mobile format
  'P0084', // customer not found / mobile mismatch
]);

export function translateError(
  err: unknown,
  t: TranslateFn,
  /** Optional context-specific key used instead of the generic
   *  fallback when the error doesn't classify more precisely. */
  fallbackKey?: string,
): string {
  const e: ErrorLike = err && typeof err === 'object' ? (err as ErrorLike) : {};
  const code = typeof e.code === 'string' ? e.code : undefined;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const message = typeof e.message === 'string' ? e.message : '';

  if (code) {
    if (RPC_UNAUTHORIZED_CODES.has(code)) return t('errors.unauthorized');
    if (RPC_VALIDATION_CODES.has(code)) return t('errors.validation');
    if (RECEIPT_PHOTO_CODES[code]) return t(RECEIPT_PHOTO_CODES[code]);
    if (code === 'P0110') return t('errors.validation'); // empty path guard
    if (code === 'P0114') return t('errors.conflict'); // wrong contract state
    // P0001 = default RAISE — all current uses are state guards
    // ("already accepted", "not in a signable state").
    if (code === 'P0001') return t('errors.conflict');
    if (code === '42501') return t('errors.unauthorized'); // RLS denial
    if (code === '23505') return t('errors.conflict'); // unique violation
    if (code.startsWith('23')) return t('errors.validation'); // integrity
    if (code === '57014') return t('errors.timeout'); // statement timeout
  }

  if (status === 401 || status === 403) return t('errors.unauthorized');

  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (
    offline ||
    /failed to fetch|network\s?error|network request failed|load failed/i.test(
      message,
    )
  ) {
    return t('errors.network');
  }
  if (/timed?\s?out/i.test(message)) return t('errors.timeout');

  if (fallbackKey) return t(fallbackKey);
  if (code) return t('errors.genericWithCode', { code });
  return t('errors.generic');
}

/**
 * Phase 6A: attach the observability event id to a user-visible
 * TECHNICAL failure message, so a support report ("it failed, code
 * LND-…") matches exactly one logged event. Not used for ordinary
 * validation messages.
 */
export function withSupportId(message: string, eventId: string): string {
  return `${message} (${eventId})`;
}

/**
 * Phase 6A: auth-specific error translation. Supabase auth errors are
 * semantically useful ("invalid credentials") so the generic
 * translator is wrong for them — but raw `err.message` must never be
 * rendered. Narrow map per the approved scope; everything else falls
 * back to translateError.
 */
export function translateAuthError(err: unknown, t: TranslateFn): string {
  const e = (err && typeof err === 'object' ? err : {}) as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const code = typeof e.code === 'string' ? e.code : '';

  if (message.includes('invalid login credentials') || code === 'invalid_credentials') {
    return t('auth.errors.invalidCredentials');
  }
  if (
    message.includes('already registered') ||
    message.includes('already been registered') ||
    code === 'user_already_exists' ||
    code === 'email_exists'
  ) {
    return t('auth.errors.emailTaken');
  }
  if (message.includes('password should be') || code === 'weak_password') {
    return t('auth.errors.weakPassword');
  }
  if (message.includes('email not confirmed') || code === 'email_not_confirmed') {
    return t('auth.errors.emailNotConfirmed');
  }
  // GoTrue surfaces ANY failure inside the signup trigger as this one
  // opaque message. The trigger now has TWO constraints real input can
  // violate — the customer-mobile unique index
  // (profiles_mobile_customer_unique) and the customer-National-ID
  // unique index (profiles_national_id_customer_unique, Bug 2) — so
  // the safe translation is the generic privacy-preserving conflict
  // message that never reveals which datum is taken or to whom.
  if (message.includes('database error saving new user')) {
    return t('auth.errors.accountDetailsConflict');
  }
  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    code === 'over_request_rate_limit'
  ) {
    return t('auth.errors.tooManyAttempts');
  }
  if (
    (message.includes('expired') || message.includes('invalid')) &&
    (message.includes('token') || message.includes('link') || code === 'otp_expired')
  ) {
    return t('auth.errors.linkExpired');
  }
  if (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    /failed to fetch|network\s?error|network request failed|load failed/i.test(message)
  ) {
    return t('errors.network');
  }
  return translateError(err, t);
}
