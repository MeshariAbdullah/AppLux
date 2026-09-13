// =====================================================================
// Merchant rental-session wizard draft — safe local persistence.
//
// The wizard's state lives in component memory, so a refresh, app
// switch, or navigation used to reset the merchant to step 1 with
// everything lost. This module persists ONLY safe form state to
// localStorage and knows how to read it back defensively.
//
// SECURITY RULES (unit-test enforced):
//   * The typed OTP code (verify.challenge) is NEVER persisted.
//   * Renter identity/PII from verification is NEVER persisted — the
//     draft stores only a CLAIM flag (`wasVerified`); on restore the
//     wizard re-confirms it against the server
//     (merchant_renter_verification_status, the exact P0195
//     predicate) and refetches the renter payload from there.
//   * Server-derived state (eligibility, issued invoice) is never
//     persisted — it is refetched on restore.
//   * A draft that claims verification but cannot be server-confirmed
//     restores to the VERIFY step, keeping the form fields.
//
// Pure and dependency-free so the same code runs under Node tests.
// =====================================================================

export const MERCHANT_SESSION_DRAFT_VERSION = 1;

/** In-store sessions are same-day by nature; a day-old draft is
 *  stale (dates, customer presence, item) — expire at 24 hours. */
export const MERCHANT_SESSION_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** 'issued' is deliberately absent: a completed session never
 *  persists — issuance clears the draft. */
export type PersistedStep =
  | 'start'
  | 'verify'
  | 'operation'
  | 'eligibility'
  | 'contract';

const PERSISTED_STEPS: readonly PersistedStep[] = [
  'start',
  'verify',
  'operation',
  'eligibility',
  'contract',
];

/** The exact OperationDraft scalar fields that may be persisted —
 *  an explicit allowlist so a future state field can never leak into
 *  storage by accident. */
export const OPERATION_DRAFT_FIELDS = [
  'itemName',
  'category',
  'lesseeNationalId',
  'startsAt',
  'pricingType',
  'rentalDays',
  'dailyRate',
  'totalRentalAmount',
  'originalItemValue',
  'damageChargeType',
  'lightDamagePercent',
  'damageFixedAmount',
  'lateFeeType',
  'lateFeePercent',
  'lateFeeFixedAmount',
] as const;
export type PersistedOperation = Record<
  (typeof OPERATION_DRAFT_FIELDS)[number],
  string
>;

export type MerchantSessionDraft = {
  v: number;
  savedAt: number;
  step: PersistedStep;
  /** The mobile the merchant typed in the verify step (form data). */
  mobile: string;
  /** CLAIM that the renter OTP was verified. NEVER trusted directly —
   *  the wizard re-confirms server-side on restore. */
  wasVerified: boolean;
  operation: PersistedOperation;
};

export function merchantSessionDraftKey(userId: string): string {
  return `lend:merchant-rental-session-draft:${userId}`;
}

type SessionLike = {
  step: string;
  verify: { mobile: string; status: string };
  operation: Record<string, unknown>;
};

/** Builds the persistable draft, or null when nothing should be kept
 *  (completed session, or a pristine step-1 state). */
export function buildMerchantSessionDraft(
  session: SessionLike,
  now: number,
): MerchantSessionDraft | null {
  if (session.step === 'issued') return null;

  const operation = {} as PersistedOperation;
  for (const key of OPERATION_DRAFT_FIELDS) {
    const value = session.operation[key];
    operation[key] = typeof value === 'string' ? value : '';
  }

  const mobile = session.verify.mobile ?? '';
  const step = (PERSISTED_STEPS as readonly string[]).includes(session.step)
    ? (session.step as PersistedStep)
    : 'start';

  // Pristine entry state — nothing worth keeping. startsAt, category
  // and the mode/percent defaults are auto-filled before any merchant
  // input, so only genuinely typed fields count.
  const TYPED_FIELDS = [
    'itemName',
    'lesseeNationalId',
    'dailyRate',
    'totalRentalAmount',
    'originalItemValue',
    'damageFixedAmount',
    'lateFeePercent',
    'lateFeeFixedAmount',
  ] as const;
  const hasInput =
    mobile.trim() !== '' ||
    step !== 'start' ||
    TYPED_FIELDS.some((k) => operation[k].trim() !== '');
  if (!hasInput) return null;

  return {
    v: MERCHANT_SESSION_DRAFT_VERSION,
    savedAt: now,
    step,
    mobile,
    wasVerified: session.verify.status === 'verified',
    operation,
  };
}

/** Parses a stored draft defensively: wrong version, expired, or
 *  malformed → null (the wizard starts fresh). */
export function parseMerchantSessionDraft(
  raw: string | null,
  now: number,
): MerchantSessionDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.v !== MERCHANT_SESSION_DRAFT_VERSION) return null;
  if (typeof d.savedAt !== 'number' || !Number.isFinite(d.savedAt)) return null;
  if (now - d.savedAt > MERCHANT_SESSION_DRAFT_TTL_MS || d.savedAt > now + 60_000) {
    return null;
  }
  if (!(PERSISTED_STEPS as readonly string[]).includes(d.step as string)) return null;
  if (typeof d.mobile !== 'string') return null;
  if (!d.operation || typeof d.operation !== 'object') return null;

  const operation = {} as PersistedOperation;
  for (const key of OPERATION_DRAFT_FIELDS) {
    const value = (d.operation as Record<string, unknown>)[key];
    operation[key] = typeof value === 'string' ? value : '';
  }

  const wasVerified = d.wasVerified === true;
  // A step beyond 'verify' is only reachable through verification —
  // an unverified draft claiming a later step is clamped back.
  const step =
    !wasVerified && d.step !== 'start' && d.step !== 'verify'
      ? 'verify'
      : (d.step as PersistedStep);

  return {
    v: MERCHANT_SESSION_DRAFT_VERSION,
    savedAt: d.savedAt,
    step,
    mobile: d.mobile,
    wasVerified,
    operation,
  };
}
