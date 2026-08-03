import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input, NumericField, Select } from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  InfoIcon,
  ShieldIcon,
  SparkleIcon,
  UserIcon,
} from '@/components/icons';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { formatValidUntil } from '@/lib/offerExpiry';
import {
  createInvoiceWithItems,
  fetchRenterEligibility,
  fetchMyMerchant,
  merchantSetCustomerNationalId,
  useSupabaseAuth,
  type MerchantRow,
  type ProfileRow,
  type RentalCategoryDB,
  type RentalEligibilityRow,
  type RentalInvoiceRow,
} from '@/lib/supabase';
import { lookupRenterByMobile } from '@/lib/otp';
import {
  confirmRenterPresence,
  RenterPresenceError,
} from '@/lib/renterVerification';
import {
  classifyMobile,
  maskMobile,
  type MobileIssue,
} from '@/lib/mobile';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { cacheInvalidatePrefix } from '@/lib/cache/memoryCache';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import { buildContractFromTemplate } from '@/lib/contractTemplate';
import { translateError } from '@/lib/errors';
import { useSensitiveFlow } from '@/lib/session/flowGuard';
import { cn } from '@/lib/cn';

// =====================================================================
// Dev-only demo fallback. Two independent gates make sure demo code can
// never run against a live backend:
//
//   1. import.meta.env.DEV is `false` in `vite build` output, so every
//      branch under DEV_DEMO_FALLBACK is tree-shaken from production.
//   2. Inside handlers we ALSO require !supabaseAuth.configured — when
//      a Supabase URL/anon key are set, the demo branch is unreachable
//      regardless of build mode. This protects `npm run dev` against a
//      live project from accidentally producing demo data.
// =====================================================================
const DEV_DEMO_FALLBACK = import.meta.env.DEV;

/**
 * Maps a mobile classification issue to the merchant-flow message. We
 * never show a vague "invalid" string — every issue has a specific
 * reason the renter can act on.
 */
function verifyMobileIssueMessage(
  issue: MobileIssue,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  switch (issue) {
    case 'empty':
      return t('merchant.session.verify.errors.mobileFormat');
    case 'incomplete':
      return t('merchant.session.verify.errors.mobileIncomplete');
    case 'unsupported_country':
      return t('merchant.session.verify.errors.mobileUnsupportedCountry');
    case 'invalid_format':
    default:
      return t('merchant.session.verify.errors.mobileFormat');
  }
}

// =====================================================================
// Typed session state — keeps the in-store rental session legible in
// one place. When a real SMS provider arrives, only `sendRenterCode` /
// `verifyRenterCode` below change; the SessionState shape stays.
// =====================================================================

type SessionStep =
  | 'start'
  | 'verify'
  | 'operation'
  | 'eligibility'
  | 'contract'
  | 'issued';

/**
 * Granular verification status. The interim renter-presence flow uses
 * a 4-state machine (no separate "code sent" step — the challenge input
 * is rendered immediately once existence is confirmed). When Twilio OTP
 * edge functions are deployed, an `otp_sent` state can be reintroduced.
 */
type VerificationStatus =
  | 'unverified'   // mobile field empty / has not been searched yet
  | 'looking_up'   // querying profiles by mobile
  | 'not_found'    // no profile matches; renter must complete account first
  | 'found'        // existence confirmed — UI prompts for the ID last-4
  | 'verified';    // identity confirmed for this session

/** Three macro states the merchant + renter actually need to see. */
type MacroVerification =
  | 'idle'           // nothing meaningful yet
  | 'verified'       // renter exists AND identity confirmed for this session
  | 'pending'        // renter exists, verification in progress (looking up / OTP)
  | 'not_found';     // renter does NOT exist — must complete account first

type VerifyState = {
  mobile: string;
  /** Renter challenge — currently the last 4 of their National ID;
   *  becomes the SMS OTP when the Twilio edge functions are deployed. */
  challenge: string;
  status: VerificationStatus;
  renter: ProfileRow | null;
  /** Customer profile id captured from `lookup_renter_by_mobile`. Kept
   *  separately from `renter` (which stays null until confirmation) so
   *  the merchant-side national-id write RPC can address the profile
   *  without exposing name/city to the merchant pre-confirmation. */
  renterId: string | null;
  /** true when the matched profile already has profiles.national_id,
   *  false when the merchant must fill it in before continuing to
   *  confirm_renter_presence. null while the lookup hasn't fired
   *  (or for legacy demo fallbacks). */
  hasNationalId: boolean | null;
  /** Draft input for the missing-national-id capture. Cleared once
   *  the RPC succeeds. */
  nationalIdInput: string;
  /** Independent submit flag for the national-id save; the main
   *  `status` machine keeps its meaning ('found' is a stable state
   *  the merchant can dwell on while filling the missing id). */
  nationalIdSaving: boolean;
  /** Optional inline error line for the national-id capture (invalid
   *  format, RPC error, etc.). */
  nationalIdError: string | null;
  error: string | null;
};

type OperationDraft = {
  itemName: string;
  category: RentalCategoryDB;
  /** `<input type="datetime-local">` value — local-timezone
   *  "YYYY-MM-DDTHH:MM" (no timezone suffix). Converted to ISO
   *  UTC when the invoice is created. Default seeded at wizard
   *  entry to "now". Required per Phase 8f validation. */
  startsAt: string;
  rentalDays: string;     // strings for input ergonomics; coerced on use
  dailyRate: string;
  originalItemValue: string;
  // Contract overrides — merchant-controlled in the new 'contract' step.
  // Stored as strings so the inputs remain ergonomic; coerced on use.
  lightDamagePercent: string;  // 0..100, default '30'
  lateReturnMultiplier: string; // ×, default '1.5'
};

type EligibilityState = {
  row: RentalEligibilityRow | null;
  loading: boolean;
  error: string | null;
};

type IssueState = {
  invoice: RentalInvoiceRow | null;
  submitting: boolean;
  error: string | null;
};

type SessionState = {
  step: SessionStep;
  verify: VerifyState;
  operation: OperationDraft;
  eligibility: EligibilityState;
  issue: IssueState;
};

type EligibilityVerdict =
  | { status: 'approved'; limit: number; used: number; remaining: number; required: number }
  | { status: 'insufficient'; limit: number; used: number; remaining: number; required: number; shortBy: number }
  | { status: 'missing' };

const INITIAL_SESSION: SessionState = {
  step: 'start',
  verify: {
    mobile: '',
    challenge: '',
    status: 'unverified',
    renter: null,
    renterId: null,
    hasNationalId: null,
    nationalIdInput: '',
    nationalIdSaving: false,
    nationalIdError: null,
    error: null,
  },
  operation: {
    itemName: '',
    category: 'dress',
    // startsAt is set at wizard entry via useEffect below so the
    // default reflects the merchant's local timezone at the exact
    // moment they open the flow — INITIAL_SESSION is captured at
    // module load and would otherwise be stale.
    startsAt: '',
    rentalDays: '1',
    dailyRate: '',
    originalItemValue: '',
    lightDamagePercent: '30',
    lateReturnMultiplier: '1.5',
  },
  eligibility: { row: null, loading: false, error: null },
  issue: { invoice: null, submitting: false, error: null },
};

const CATEGORIES: RentalCategoryDB[] = ['dress', 'bag', 'watch', 'bisht'];
const STEPS: SessionStep[] = [
  'start',
  'verify',
  'operation',
  'eligibility',
  'contract',
  'issued',
];

// ---------------------------------------------------------------------

function macroVerificationState(s: VerificationStatus): MacroVerification {
  if (s === 'verified') return 'verified';
  if (s === 'not_found') return 'not_found';
  if (s === 'found' || s === 'looking_up') return 'pending';
  return 'idle';
}

/** Rental fee — what the customer pays for the rental period. Separate
 *  from the original item value, which represents the underlying value
 *  of the rented piece. */
function computeRentalAmount(draft: OperationDraft): number {
  const rate = Number(draft.dailyRate) || 0;
  const days = Math.max(Number(draft.rentalDays) || 1, 1);
  return rate * days;
}

function readOriginalItemValue(draft: OperationDraft): number {
  return Number(draft.originalItemValue) || 0;
}

/** Local-timezone "YYYY-MM-DDTHH:MM" for a given instant (ms). */
function dateTimeInputFrom(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Local-timezone "YYYY-MM-DDTHH:MM" for <input type="datetime-local">. */
function nowForDateTimeInput(): string {
  return dateTimeInputFrom(Date.now());
}

/**
 * Parse a datetime-local string ("YYYY-MM-DDTHH:MM") into a Date in
 * the merchant's local timezone. Returns null if the value is empty
 * or unparseable.
 */
function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Rental end = start + rentalDays. Returns null when start is invalid. */
function computeRentalEnd(startsAt: string, rentalDays: string): Date | null {
  const start = parseDateTimeLocal(startsAt);
  if (!start) return null;
  const days = Math.max(Number(rentalDays) || 1, 1);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return end;
}

/** Availability check against the renter's existing eligibility — NOT a
 *  new risk score. Compares remaining limit against the ORIGINAL ITEM
 *  VALUE, not the rental fee, because the eligibility hold mirrors
 *  the promissory note principal. */
function deriveVerdict(
  renterEligibility: RentalEligibilityRow | null,
  originalItemValue: number,
): EligibilityVerdict {
  if (!renterEligibility) return { status: 'missing' };
  const limit = Number(renterEligibility.limit_amount);
  const used = Number(renterEligibility.used_amount);
  // Offer reservations (20260502123600): amounts held by offers still
  // awaiting the customer's decision reduce what THIS offer may use.
  // The RPC returns the derived figure; before the migration is
  // applied the field is absent and reserved counts as 0. The server
  // trigger (P0160) stays authoritative either way.
  const reserved = Math.max(Number(renterEligibility.reserved_amount ?? 0), 0);
  const remaining = Math.max(limit - used - reserved, 0);
  const required = Math.max(originalItemValue, 0);
  if (remaining >= required) return { status: 'approved', limit, used, remaining, required };
  return {
    status: 'insufficient',
    limit, used, remaining, required,
    shortBy: required - remaining,
  };
}

// =====================================================================
// Component
// =====================================================================

export default function MerchantRentalSession() {
  const t = useT();
  const { dir, formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const supabaseAuth = useSupabaseAuth();

  const [session, setSession] = useState<SessionState>(INITIAL_SESSION);
  // Session hardening: an in-store rental session past the start step
  // means a customer is standing at the counter — never idle-logout
  // mid-wizard (see src/lib/session/flowGuard.ts). Wizard state is
  // in-memory only, so a forced logout would discard the whole draft.
  useSensitiveFlow(session.step !== 'start');
  const [merchantId, setMerchantId] = useState<string | null>(null);
  // Live clock so the start-date picker's `min` and the "must be in the
  // future" check advance while the screen stays open (stale-screen /
  // long-idle cases). Ticks every 15s; the server P0180 guard is the
  // authority regardless of the device clock.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const [merchantPrimaryCategory, setMerchantPrimaryCategory] =
    useState<RentalCategoryDB | null>(null);
  // Full merchant row — used by the new ContractCard preview so the
  // "Lessor" clause shows the correct boutique name.
  const [liveMerchant, setLiveMerchant] = useState<MerchantRow | null>(null);

  const setStep = (step: SessionStep) =>
    setSession((s) => ({ ...s, step }));
  const updateVerify = (patch: Partial<VerifyState>) =>
    setSession((s) => ({ ...s, verify: { ...s.verify, ...patch } }));
  const updateOperation = (patch: Partial<OperationDraft>) =>
    setSession((s) => ({ ...s, operation: { ...s.operation, ...patch } }));
  const updateEligibility = (patch: Partial<EligibilityState>) =>
    setSession((s) => ({ ...s, eligibility: { ...s.eligibility, ...patch } }));
  const updateIssue = (patch: Partial<IssueState>) =>
    setSession((s) => ({ ...s, issue: { ...s.issue, ...patch } }));

  // Seed `operation.startsAt` to the merchant's local "now" once,
  // when they first land on the wizard. Doing it in an effect
  // (rather than in INITIAL_SESSION) means the default reflects
  // the actual moment they open the flow, not the moment the
  // module first loaded. Only fires when the field is empty so
  // going back-and-forth through the wizard never clobbers a
  // merchant-typed value.
  useEffect(() => {
    setSession((s) =>
      s.operation.startsAt
        ? s
        : { ...s, operation: { ...s.operation, startsAt: nowForDateTimeInput() } },
    );
  }, []);

  // Merchant identity via the shared memory cache (Phase 3B) — same
  // key MerchantHome/MerchantRentals use, so opening the wizard from
  // the dashboard is instant. Safe for this flow: id + primary
  // category are stable for the session; issuance still writes
  // through live RPCs. Errors are ignored exactly like the previous
  // .catch(() => {}) — the issue CTA stays disabled until merchantId
  // resolves.
  const wizardUserId = supabaseAuth.session?.user?.id ?? null;
  const { data: myMerchantRow } = useCachedQuery(
    supabaseAuth.configured && wizardUserId
      ? cacheKeys.myMerchant(wizardUserId)
      : null,
    () => fetchMyMerchant(wizardUserId!),
    { ttlMs: CACHE_TTL.myMerchant, refetchOnFocus: false },
  );
  useEffect(() => {
    if (!myMerchantRow) return;
    setMerchantId(myMerchantRow.id);
    setLiveMerchant(myMerchantRow);
    setMerchantPrimaryCategory(myMerchantRow.primary_category);
    setSession((s) =>
      s.operation.category === 'dress'
        ? {
            ...s,
            operation: { ...s.operation, category: myMerchantRow.primary_category },
          }
        : s,
    );
  }, [myMerchantRow]);

  const rentalAmount = useMemo(
    () => computeRentalAmount(session.operation),
    [session.operation],
  );
  const originalItemValue = useMemo(
    () => readOriginalItemValue(session.operation),
    [session.operation],
  );
  const verdict = useMemo(
    () => deriveVerdict(session.eligibility.row, originalItemValue),
    [session.eligibility.row, originalItemValue],
  );
  const macroVerify = macroVerificationState(session.verify.status);

  // ---------------- Step actions ----------------

  const handleStart = () => setStep('verify');

  // Wizard back navigation. Preserves every field in `session` — only
  // `session.step` moves. On the first step (`start`) the button
  // exits the wizard entirely via the browser stack; on any other
  // step it walks one entry back in the STEPS list. Explicit cancel
  // remains the only mechanism that wipes the draft.
  const handleBack = () => {
    const idx = STEPS.indexOf(session.step);
    if (idx <= 0) {
      navigate(-1);
      return;
    }
    setStep(STEPS[idx - 1]);
  };

  const handleLookupRenter = async () => {
    updateVerify({ error: null });
    // Hard-block: lookup never fires unless the number normalizes to the
    // canonical Saudi shape. Use the classifier (single source of truth)
    // so the user sees a precise message for whatever's wrong.
    const classification = classifyMobile(session.verify.mobile);
    if (classification.kind !== 'valid') {
      updateVerify({ error: verifyMobileIssueMessage(classification.issue, t) });
      return;
    }
    const normalized = classification;

    if (!supabaseAuth.configured) {
      // Production path requires the live backend. The dev fallback below
      // is intentionally minimal and is tree-shaken out of production builds.
      if (DEV_DEMO_FALLBACK) {
        // Simulate the missing-national-id path so the merchant flow can
        // be exercised without a live backend. Real IDs are never written
        // in this branch — the "Save" button no-ops when Supabase is off.
        updateVerify({
          status: 'found',
          renter: null,
          renterId: 'dev-renter',
          hasNationalId: false,
          nationalIdInput: '',
          nationalIdError: null,
        });
        return;
      }
      updateVerify({
        status: 'unverified',
        error: t('merchant.session.verify.errors.backendRequired'),
      });
      return;
    }

    updateVerify({ status: 'looking_up' });
    try {
      const existence = await lookupRenterByMobile(normalized.canonical);
      if (!existence) {
        updateVerify({
          status: 'not_found',
          renter: null,
          renterId: null,
          hasNationalId: null,
        });
        return;
      }
      // EXISTENCE-ONLY at this point — by policy we do NOT surface the
      // renter's name, city, or other details to the merchant until the
      // OTP succeeds. The renter object stays null; the verify card
      // shows a generic "Renter is registered" panel.
      //
      // `renterId` IS retained so we can address the profile for the
      // merchant-side national-id write when has_national_id is false.
      // The RPC still guards mobile match + role server-side, so exposing
      // just the id here doesn't leak anything the merchant couldn't
      // already infer from the successful lookup.
      updateVerify({
        status: 'found',
        renter: null,
        renterId: existence.id,
        hasNationalId: existence.has_national_id,
        nationalIdInput: '',
        nationalIdError: null,
      });
    } catch (err) {
      // Backend or network error — don't surface the raw provider message;
      // give the merchant a calm, actionable line.
      logEvent('rpc_failure', 'warn', { op: 'lookup_renter_by_mobile' }, err);
      updateVerify({
        status: 'unverified',
        error: t('merchant.session.verify.errors.mobileVerifyFailed'),
      });
    }
  };

  // Merchant fills a missing customer National ID during the verify
  // step. Only reachable when `hasNationalId === false` — the UI hides
  // the input as soon as the RPC succeeds.
  //
  // Client-side format check is defence-in-depth; the RPC is the
  // authoritative validator (Saudi ID format, role check, mobile match,
  // "must-be-empty" guard, active merchant/admin check).
  const handleSaveCustomerNationalId = async () => {
    const raw = session.verify.nationalIdInput.trim();
    if (!/^[12]\d{9}$/.test(raw)) {
      updateVerify({
        nationalIdError: t('merchant.session.verify.nationalId.invalid'),
      });
      return;
    }
    const classification = classifyMobile(session.verify.mobile);
    if (classification.kind !== 'valid') {
      updateVerify({ error: verifyMobileIssueMessage(classification.issue, t) });
      return;
    }
    if (!session.verify.renterId) {
      updateVerify({
        nationalIdError: t('merchant.session.verify.errors.mobileVerifyFailed'),
      });
      return;
    }

    if (!supabaseAuth.configured) {
      // Dev-only path — no live backend, so we simulate a successful
      // save. The tree-shake guard means production never enters here.
      if (DEV_DEMO_FALLBACK) {
        updateVerify({
          hasNationalId: true,
          nationalIdInput: '',
          nationalIdSaving: false,
          nationalIdError: null,
        });
        return;
      }
      updateVerify({
        nationalIdError: t('merchant.session.verify.errors.backendRequired'),
      });
      return;
    }

    updateVerify({ nationalIdSaving: true, nationalIdError: null });
    try {
      await merchantSetCustomerNationalId({
        customerId: session.verify.renterId,
        mobile: classification.canonical,
        nationalId: raw,
      });
      updateVerify({
        hasNationalId: true,
        nationalIdInput: '',
        nationalIdSaving: false,
        nationalIdError: null,
      });
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'merchant_set_customer_national_id' }, err);
      updateVerify({
        nationalIdSaving: false,
        nationalIdError: t('merchant.session.verify.errors.mobileVerifyFailed'),
      });
    }
  };

  // Interim renter-presence confirmation. Replaces the OTP send/verify
  // pair until Twilio Verify edge functions are deployed. Returns the
  // renter's safe profile fields only when the canonical mobile AND the
  // last 4 of their National ID both match server-side.
  const handleConfirmPresence = async () => {
    if (session.verify.status !== 'found') return;
    // Block confirmation until the merchant has captured the customer's
    // National ID. UI already hides the challenge input in that state,
    // but this defence-in-depth guard keeps handler + view in sync.
    if (session.verify.hasNationalId === false) return;
    // Re-classify the mobile (defense-in-depth — lookup normally catches
    // this first, but the field could be edited after lookup succeeded).
    const classification = classifyMobile(session.verify.mobile);
    if (classification.kind !== 'valid') {
      updateVerify({ error: verifyMobileIssueMessage(classification.issue, t) });
      return;
    }
    const trimmed = session.verify.challenge.replace(/\D/g, '');
    if (trimmed.length !== 4) {
      updateVerify({ error: t('merchant.session.verify.errors.idLast4Length') });
      return;
    }

    if (!supabaseAuth.configured) {
      if (DEV_DEMO_FALLBACK) {
        // Synthesize a renter only at verification time, mirroring the
        // live flow where renter details are exclusively revealed after
        // a successful match.
        updateVerify({
          status: 'verified',
          error: null,
          renter: {
            id: 'dev-renter',
            full_name: '[dev] Renter',
            mobile: classification.canonical,
            email: null,
            national_id: null,
            city: 'riyadh',
            role: 'customer',
            account_status: 'active',
            nafath_verified_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as ProfileRow,
        });
        setStep('operation');
        return;
      }
      updateVerify({ error: t('merchant.session.verify.errors.backendRequired') });
      return;
    }

    try {
      const result = await confirmRenterPresence(
        session.verify.mobile,
        trimmed,
      );
      if (!result.verified) {
        updateVerify({ error: t('merchant.session.verify.errors.idLast4Failed') });
        return;
      }
      // The RPC is authoritative for the renter identity — populate the
      // verify state from its payload, not the lookup snapshot.
      updateVerify({
        status: 'verified',
        error: null,
        renter: {
          id: result.renter.id,
          full_name: result.renter.full_name,
          mobile: result.renter.mobile,
          email: null,
          national_id: null,
          city: result.renter.city,
          role: 'customer',
          account_status: 'active',
          nafath_verified_at: result.renter.has_nafath ? new Date(0).toISOString() : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ProfileRow,
      });
      setStep('operation');
    } catch (err) {
      const message =
        err instanceof RenterPresenceError && err.code === 'forbidden'
          ? t('merchant.session.verify.errors.forbidden')
          : err instanceof RenterPresenceError && err.code === 'invalid_mobile'
            ? verifyMobileIssueMessage('invalid_format', t)
            : err instanceof RenterPresenceError && err.code === 'invalid_id_last4'
              ? t('merchant.session.verify.errors.idLast4Length')
              : t('merchant.session.verify.errors.idLast4Failed');
      logEvent('rpc_failure', 'warn', { op: 'confirm_renter_presence' }, err);
      updateVerify({ error: message });
    }
  };

  const handleOperationContinue = async () => {
    const op = session.operation;
    // Mandatory fields — every operation must declare the item, period,
    // daily rate, AND the original item value (basis for eligibility +
    // promissory note).
    if (!op.itemName.trim()) return;
    if (Number(op.dailyRate) <= 0) return;
    if (Number(op.rentalDays) < 1) return;
    if (!(Number(op.originalItemValue) > 0)) return;

    // Revalidate the rental start against a FRESH server-aligned clock at
    // the moment of Continue (covers "chose a future time, then it passed
    // while the screen stayed open" and the exact-boundary tap). Refresh
    // nowMs so OperationCard shows the inline start error + disables. The
    // server P0180 guard remains the final authority.
    const startAt = parseDateTimeLocal(op.startsAt);
    if (!startAt || startAt.getTime() <= Date.now()) {
      setNowMs(Date.now());
      return;
    }

    if (!supabaseAuth.configured) {
      if (DEV_DEMO_FALLBACK && session.verify.renter) {
        updateEligibility({
          row: {
            user_id: session.verify.renter.id,
            limit_amount: 50000,
            used_amount: 18500,
            tier: 'premium',
            assigned_by: null,
            assigned_at: new Date().toISOString(),
            notes: null,
            updated_at: new Date().toISOString(),
          },
          loading: false,
          error: null,
        });
        setStep('eligibility');
        return;
      }
      updateEligibility({
        loading: false,
        error: t('merchant.session.verify.errors.backendRequired'),
      });
      return;
    }

    if (!session.verify.renter) return;

    updateEligibility({ loading: true, error: null });
    try {
      // SECURITY DEFINER RPC — the table's RLS does not grant
      // merchants direct SELECT on other users' eligibility rows.
      // `fetchEligibility` here would silently return null even when
      // the row exists, and the verdict would render as "missing".
      const row = await fetchRenterEligibility(session.verify.renter.id);
      updateEligibility({ row, loading: false, error: null });
      setStep('eligibility');
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'fetch_renter_eligibility' }, err);
      updateEligibility({
        loading: false,
        error: translateError(err, t, 'merchant.session.eligibility.errors.fetch'),
      });
    }
  };

  const handleIssue = async () => {
    if (verdict.status !== 'approved' || !session.verify.renter) return;

    const rate = Number(session.operation.dailyRate) || 0;
    const days = Math.max(Number(session.operation.rentalDays) || 1, 1);
    const rentalFee = rate * days;
    const itemValue = Number(session.operation.originalItemValue) || 0;
    const lightDamageFraction = clampLightFraction(session.operation.lightDamagePercent);
    const lateReturnMultiplier = clampLateMultiplier(session.operation.lateReturnMultiplier);

    // --- Dev-only synthetic issuance ----------------------------------
    // Production builds tree-shake this branch (DEV_DEMO_FALLBACK = false).
    // The real path begins at the merchantId guard below.
    if (!supabaseAuth.configured) {
      if (DEV_DEMO_FALLBACK) {
        updateIssue({ submitting: true, error: null });
        await new Promise((r) => window.setTimeout(r, 400));
        const token = `DEV-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
        const now = new Date().toISOString();
        const fixture: RentalInvoiceRow = {
          id: token,
          invoice_number: `INV-DEV-${Date.now().toString().slice(-6)}`,
          merchant_id: 'dev-merchant',
          branch_id: null,
          customer_user_id: session.verify.renter.id,
          subtotal_amount: rentalFee,
          tax_amount: 0,
          security_deposit: 0,
          total_amount: rentalFee,
          original_item_value: itemValue,
          light_damage_fraction: lightDamageFraction,
          late_return_multiplier: lateReturnMultiplier,
          status: 'issued',
          issued_at: now,
          expires_at: null,
          starts_at:
            parseDateTimeLocal(session.operation.startsAt)?.toISOString() ?? null,
          scan_token: token,
          notes: null,
          created_at: now,
          updated_at: now,
        };
        updateIssue({ invoice: fixture, submitting: false, error: null });
        setStep('issued');
        return;
      }
      updateIssue({
        submitting: false,
        error: t('merchant.session.verify.errors.backendRequired'),
      });
      return;
    }

    // --- Real live issuance -------------------------------------------
    // Guard explicitly so the merchant never taps a button that does
    // nothing — surface a clear error instead.
    if (!merchantId) {
      updateIssue({
        submitting: false,
        error: t('merchant.session.eligibility.errors.merchantLoading'),
      });
      return;
    }

    updateIssue({ submitting: true, error: null });
    try {
      const result = await createInvoiceWithItems({
        merchantId,
        customerUserId: session.verify.renter.id,
        // Rental fee = daily × days. The new original_item_value is a
        // separate column that drives eligibility + note principal.
        subtotalAmount: rentalFee,
        totalAmount: rentalFee,
        originalItemValue: itemValue,
        lightDamageFraction,
        lateReturnMultiplier,
        // Merchant-set rental start moment. `parseDateTimeLocal`
        // interprets the datetime-local input in the browser's
        // (i.e. the merchant's) timezone; `.toISOString()` normalises
        // to UTC for storage. The DB column is timestamptz, so the
        // instant is preserved regardless of viewer timezone.
        startsAt:
          parseDateTimeLocal(session.operation.startsAt)?.toISOString() ?? null,
        items: [
          {
            position: 0,
            item_name: session.operation.itemName.trim(),
            category: session.operation.category,
            size_label: null,
            color: null,
            daily_rate: rate,
            rental_days: days,
            subtotal: rentalFee,
            replacement_value: itemValue,
            notes: null,
          },
        ],
      });
      // Phase 4A invalidation: a new issued invoice exists — drop every
      // cached merchant:{uid}:invoices* variant so MerchantHome's
      // pending count refetches fresh on next visit.
      if (wizardUserId) {
        cacheInvalidatePrefix(cacheKeys.merchantInvoices(wizardUserId));
      }
      updateIssue({ invoice: result.invoice, submitting: false, error: null });
      setStep('issued');
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'create_invoice_with_items' }, err);
      const code = (err as { code?: unknown })?.code;
      if (code === 'P0180') {
        // The rental start passed between setup and issuance — return to
        // the setup step with the inline start error (data preserved),
        // rather than stranding the merchant on a generic banner.
        updateIssue({ submitting: false, error: null });
        setNowMs(Date.now());
        setStep('operation');
        return;
      }
      updateIssue({
        submitting: false,
        error: translateError(err, t),
      });
    }
  };

  // ---------------- Render ----------------

  const stepIndex = STEPS.indexOf(session.step);

  return (
    <>
      {session.step !== 'issued' && (
      <Header
        title={t('merchant.session.title')}
        leading={
          <button
            type="button"
            onClick={handleBack}
            aria-label={t('merchant.session.back')}
            className="h-9 w-9 grid place-items-center rounded-[10px] bg-white text-navy-700 shadow-soft transition-transform active:scale-95"
          >
            <ArrowIcon
              size={16}
              className={cn(dir === 'rtl' ? '' : 'rotate-180')}
            />
          </button>
        }
      />
      )}
      <Screen padded={false} className="bg-beige-100">
        <div
          className={
            session.step === 'issued'
              ? 'px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-10 flex flex-col justify-center min-h-full'
              : 'px-5 pt-5 pb-10 space-y-5'
          }
        >
          {session.step !== 'issued' && <SessionEyebrow stepIndex={stepIndex} t={t} />}

          {session.step === 'start' && <StartCard t={t} onBegin={handleStart} />}

          {session.step !== 'start' && session.step !== 'issued' && (
            <VerifyCard
              t={t}
              dir={dir}
              status={session.verify.status}
              macro={macroVerify}
              mobile={session.verify.mobile}
              setMobile={(v) => {
                // Editing the mobile invalidates a prior lookup, but keep
                // the field stable when the user is just typing characters.
                // Any renterId / national-id draft is dropped so the next
                // lookup starts from a clean slate.
                updateVerify({
                  mobile: v,
                  status:
                    session.verify.status === 'looking_up' ||
                    session.verify.status === 'unverified'
                      ? session.verify.status
                      : 'unverified',
                  renter:
                    session.verify.status === 'looking_up'
                      ? session.verify.renter
                      : null,
                  renterId:
                    session.verify.status === 'looking_up'
                      ? session.verify.renterId
                      : null,
                  hasNationalId:
                    session.verify.status === 'looking_up'
                      ? session.verify.hasNationalId
                      : null,
                  nationalIdInput: '',
                  nationalIdError: null,
                  error: null,
                });
              }}
              renter={session.verify.renter}
              challenge={session.verify.challenge}
              setChallenge={(v) => updateVerify({ challenge: v })}
              hasNationalId={session.verify.hasNationalId}
              nationalIdInput={session.verify.nationalIdInput}
              setNationalIdInput={(v) =>
                updateVerify({
                  nationalIdInput: v.replace(/\D/g, '').slice(0, 10),
                  nationalIdError: null,
                })
              }
              nationalIdSaving={session.verify.nationalIdSaving}
              nationalIdError={session.verify.nationalIdError}
              onSaveNationalId={handleSaveCustomerNationalId}
              verifyError={session.verify.error}
              onLookup={handleLookupRenter}
              onConfirmPresence={handleConfirmPresence}
              active={session.step === 'verify'}
              locked={session.step !== 'verify' && session.verify.status === 'verified'}
            />
          )}

          {(session.step === 'operation' ||
            session.step === 'eligibility' ||
            session.step === 'contract') && (
            <OperationCard
              t={t}
              operation={session.operation}
              setOperation={updateOperation}
              merchantPrimaryCategory={merchantPrimaryCategory}
              rentalAmount={rentalAmount}
              originalItemValue={originalItemValue}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              locale={locale}
              active={session.step === 'operation'}
              locked={
                session.step === 'eligibility' ||
                session.step === 'contract'
              }
              loading={session.eligibility.loading}
              error={session.eligibility.error}
              onContinue={handleOperationContinue}
              nowMs={nowMs}
            />
          )}

          {(session.step === 'eligibility' ||
            session.step === 'contract') && (
            <EligibilityCard
              t={t}
              verdict={verdict}
              rentalAmount={rentalAmount}
              originalItemValue={originalItemValue}
              formatCurrency={formatCurrency}
              issuing={false}
              issueError={null}
              issueDisabled={false}
              active={session.step === 'eligibility'}
              locked={session.step === 'contract'}
              onIssue={() => setStep('contract')}
              onReduce={() => setStep('operation')}
              onCancel={() => navigate('/merchant/home')}
            />
          )}

          {session.step === 'contract' && (
            <ContractCard
              t={t}
              dir={dir}
              operation={session.operation}
              setOperation={updateOperation}
              merchant={liveMerchant}
              rentalAmount={rentalAmount}
              originalItemValue={originalItemValue}
              formatCurrency={formatCurrency}
              active
              locked={false}
              issuing={session.issue.submitting}
              issueError={session.issue.error}
              issueDisabled={supabaseAuth.configured && !merchantId}
              onIssue={handleIssue}
            />
          )}

          {session.step === 'issued' && session.issue.invoice && (
            <HandoffCard
              t={t}
              dir={dir}
              invoice={session.issue.invoice}
              renter={session.verify.renter}
              navigate={navigate}
            />
          )}
        </div>
      </Screen>
    </>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

function SessionEyebrow({
  stepIndex,
  t,
}: {
  stepIndex: number;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  // 'issued' is the terminal state, not a numbered step.
  const numberedTotal = STEPS.length - 1;
  const currentNumber =
    stepIndex < 0
      ? 1
      : stepIndex === STEPS.indexOf('issued')
        ? numberedTotal
        : Math.max(stepIndex, 0) + 1;
  // M10 progress language — matches the M02 wizard: eyebrow + LTR
  // counter over a segmented bar (done = deep green, current = vibrant
  // green). The step count is the REAL count; the flow is deliberately
  // never presented as shorter than it is.
  return (
    <div className="px-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-green-700">
          {t('merchant.session.eyebrow')}
        </div>
        <div className="text-[11.5px] text-ink-500 num" dir="ltr">
          {currentNumber} / {numberedTotal}
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5" aria-hidden>
        {Array.from({ length: numberedTotal }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < currentNumber - 1
                ? 'bg-green-700'
                : i === currentNumber - 1
                  ? 'bg-green-500'
                  : 'bg-navy-100/60',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function StepShell({
  number,
  title,
  hint,
  active,
  locked,
  children,
}: {
  number: number;
  title: ReactNode;
  hint?: ReactNode;
  active: boolean;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-[14px] bg-white ring-1 ring-beige-200 p-5 transition-opacity',
        locked && 'opacity-70',
        active && 'ring-[1.5px] ring-green-500',
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'relative h-9 w-9 shrink-0 rounded-full grid place-items-center text-[12.5px] font-bold num',
            locked
              ? 'bg-green-700 text-white'
              : active
                ? 'bg-white border-[3px] border-green-500 text-green-700'
                : 'bg-beige-100 text-ink-500 ring-1 ring-beige-200',
          )}
          aria-hidden
        >
          {locked ? <CheckIcon size={14} strokeWidth={3} /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'editorial-title leading-tight',
              active ? 'text-[16px] text-ink-900' : 'text-[14.5px] text-ink-900',
            )}
          >
            {title}
          </div>
          {hint && (
            <div className="mt-1 text-[12px] text-ink-500 leading-relaxed">{hint}</div>
          )}
          {(active || locked) && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </section>
  );
}

function StartCard({
  t,
  onBegin,
}: {
  t: (k: string) => string;
  onBegin: () => void;
}) {
  // Design language: solid deep-navy card with the vibrant-green CTA
  // (no gradients — 2026 brand rules).
  return (
    <section className="rounded-xl3 bg-navy-700 text-white p-6 shadow-plush">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/20 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-green-200">
        <SparkleIcon size={11} />
        {t('merchant.session.start.eyebrow')}
      </span>
      <h2 className="mt-4 text-[22px] font-bold leading-snug">
        {t('merchant.session.start.title')}
      </h2>
      <p className="mt-2.5 text-[13px] text-white/70 leading-[1.9] max-w-[36ch]">
        {t('merchant.session.start.body')}
      </p>
      <button
        type="button"
        onClick={onBegin}
        className="mt-5 flex items-center justify-center h-13 w-full rounded-xl2 bg-green-500 text-white font-bold text-[15px] hover:bg-green-600 active:bg-green-600 transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985] select-none"
      >
        {t('merchant.session.start.cta')}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------
// Verify step — three distinct macro states each get their own panel
// so the merchant + renter can read the situation at a glance.
// ---------------------------------------------------------------------

function VerifyCard({
  t,
  dir,
  status,
  macro,
  mobile,
  setMobile,
  renter,
  challenge,
  setChallenge,
  hasNationalId,
  nationalIdInput,
  setNationalIdInput,
  nationalIdSaving,
  nationalIdError,
  onSaveNationalId,
  verifyError,
  onLookup,
  onConfirmPresence,
  active,
  locked,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  status: VerificationStatus;
  macro: MacroVerification;
  mobile: string;
  setMobile: (v: string) => void;
  renter: ProfileRow | null;
  challenge: string;
  setChallenge: (v: string) => void;
  hasNationalId: boolean | null;
  nationalIdInput: string;
  setNationalIdInput: (v: string) => void;
  nationalIdSaving: boolean;
  nationalIdError: string | null;
  onSaveNationalId: () => void;
  verifyError: string | null;
  onLookup: () => void;
  onConfirmPresence: () => void;
  active: boolean;
  locked: boolean;
}) {
  // Live validation — the user sees whether their number is accepted
  // BEFORE they tap Look up, and gets a precise message for whatever's
  // wrong (incomplete, foreign country, malformed). The DB CHECK on
  // profiles.mobile remains the single source of truth for storage.
  const [mobileTouched, setMobileTouched] = useState(false);
  const mobileClassification = classifyMobile(mobile);
  const normalizedMobile =
    mobileClassification.kind === 'valid' ? mobileClassification : null;
  const mobileError =
    mobileTouched &&
    mobile.trim().length > 0 &&
    mobileClassification.kind === 'invalid'
      ? verifyMobileIssueMessage(mobileClassification.issue, t)
      : undefined;
  // Hard block — lookup button is disabled unless the number is valid.
  const canSubmitLookup = normalizedMobile !== null && status !== 'looking_up';
  return (
    <StepShell
      number={1}
      title={t('merchant.session.verify.title')}
      hint={!active && !locked ? t('merchant.session.verify.hint') : undefined}
      active={active}
      locked={locked}
    >
      {/* Locked summary — renter is verified, step is done. */}
      {locked && renter && (
        <VerificationBanner macro="verified" t={t}>
          <RenterSummary renter={renter} t={t} />
        </VerificationBanner>
      )}

      {/* Active panel */}
      {active && (
        <div className="space-y-4">
          {/* Lookup phase — initial input + lookup button */}
          {(status === 'unverified' || status === 'looking_up') && (
            <>
              <FormField
                label={t('merchant.session.verify.mobileLabel')}
                hint={
                  !mobileError
                    ? t('merchant.session.verify.mobileHint')
                    : undefined
                }
                error={mobileError}
              >
                <Input
                  inputMode="tel"
                  placeholder="5XXXXXXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  onBlur={() => setMobileTouched(true)}
                  leading={
                    <span className="text-ink-500 text-[13px] font-medium num">+966</span>
                  }
                  invalid={Boolean(mobileError)}
                  maxLength={14}
                />
              </FormField>
              {normalizedMobile && (
                <div
                  className="rounded-xl2 bg-canvas-100/70 ring-1 ring-canvas-200 px-3.5 py-2 text-[11.5px] text-ink-500 flex items-center gap-2"
                  aria-live="polite"
                >
                  <BadgeCheckIcon size={12} className="text-lavender-600 shrink-0" />
                  <span className="num">
                    {t('merchant.session.verify.mobileAccepted', {
                      e164: normalizedMobile.e164,
                    })}
                  </span>
                </div>
              )}
              {verifyError && (
                <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
                  {verifyError}
                </div>
              )}
              <Button
                variant="primary"
                size="lg"
                block
                onClick={onLookup}
                loading={status === 'looking_up'}
                disabled={!canSubmitLookup}
              >
                {t('merchant.session.verify.lookupCta')}
              </Button>
            </>
          )}

          {/* Pending — renter exists, verification in progress.
              By policy, renter identity is NOT shown to the merchant
              at this stage. The challenge (last 4 of National ID) is
              what reveals the renter's profile.

              When `hasNationalId === false`, the customer's profile
              was created without a National ID (e.g. legacy sign-ups
              from before Register captured the field). The merchant
              must fill it in first — the challenge input is hidden
              until the RPC succeeds. */}
          {status === 'found' && (
            <>
              <VerificationBanner macro="pending" t={t}>
                <div className="rounded-xl2 bg-white ring-1 ring-canvas-200 p-3 flex items-start gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-2xl bg-canvas-100 ring-1 ring-lavender-200 text-lavender-700 grid place-items-center">
                    <ShieldIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink-900">
                      {t('merchant.session.verify.privacy.title')}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-500 leading-relaxed num">
                      {t('merchant.session.verify.privacy.body', {
                        mask: maskMobile(
                          normalizedMobile ? normalizedMobile.canonical : mobile,
                        ),
                      })}
                    </div>
                  </div>
                </div>
              </VerificationBanner>

              {hasNationalId === false ? (
                <>
                  <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/25 px-3.5 py-3">
                    <div className="text-[12.5px] font-semibold text-warn-700 leading-tight">
                      {t('merchant.session.verify.nationalId.missingTitle')}
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-600 leading-relaxed">
                      {t('merchant.session.verify.nationalId.missingHint')}
                    </p>
                  </div>
                  <FormField
                    label={t('merchant.session.verify.nationalId.label')}
                    error={nationalIdError ?? undefined}
                  >
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder={t(
                        'merchant.session.verify.nationalId.placeholder',
                      )}
                      value={nationalIdInput}
                      onChange={(e) => setNationalIdInput(e.target.value)}
                      maxLength={10}
                      invalid={Boolean(nationalIdError)}
                      leading={<UserIcon size={14} className="text-lavender-600" />}
                      className="num tracking-[0.2em] text-left"
                    />
                  </FormField>
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    onClick={onSaveNationalId}
                    loading={nationalIdSaving}
                    disabled={
                      nationalIdSaving ||
                      !/^[12]\d{9}$/.test(nationalIdInput)
                    }
                  >
                    {nationalIdSaving
                      ? t('merchant.session.verify.nationalId.saving')
                      : t('merchant.session.verify.nationalId.saveCta')}
                  </Button>
                </>
              ) : (
                <>
                  {hasNationalId === true && (
                    <div
                      className="rounded-xl2 bg-success-50 ring-1 ring-success-500/25 px-3.5 py-2 text-[11.5px] text-success-700 flex items-center gap-1.5"
                      aria-live="polite"
                    >
                      <BadgeCheckIcon size={12} className="shrink-0" />
                      <span>
                        {t('merchant.session.verify.nationalId.capturedChip')}
                      </span>
                    </div>
                  )}
                  <FormField
                    label={t('merchant.session.verify.idLast4Label')}
                    hint={t('merchant.session.verify.idLast4Hint')}
                  >
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="1234"
                      value={challenge}
                      onChange={(e) =>
                        setChallenge(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      maxLength={4}
                      leading={<ShieldIcon size={14} className="text-lavender-600" />}
                      className="num tracking-[0.4em] text-center"
                    />
                  </FormField>
                  {verifyError && (
                    <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
                      {verifyError}
                    </div>
                  )}
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    onClick={onConfirmPresence}
                    disabled={challenge.replace(/\D/g, '').length !== 4}
                  >
                    {t('merchant.session.verify.confirmCta')}
                    <ArrowIcon
                      size={14}
                      className={cn('ms-1', dir === 'rtl' ? 'rotate-180' : '')}
                    />
                  </Button>
                </>
              )}
            </>
          )}

          {/* Not found — renter has no account yet */}
          {status === 'not_found' && (
            <VerificationBanner macro="not_found" t={t}>
              <p className="text-[12.5px] text-ink-700 leading-relaxed">
                {t('merchant.session.verify.notFound.body')}
              </p>
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/auth/register`;
                  navigator.clipboard?.writeText(url).catch(() => {});
                }}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-lavender-700"
              >
                {t('merchant.session.verify.notFound.copyLink')}
                <ArrowIcon size={12} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
              </button>
              <button
                type="button"
                onClick={() => setMobile('')}
                className="ms-3 text-[12px] text-ink-500 underline underline-offset-4 decoration-canvas-300"
              >
                {t('merchant.session.verify.notFound.tryDifferent')}
              </button>
            </VerificationBanner>
          )}

          {/* Macro idle / verified handled outside this branch */}
          {macro === 'verified' && (
            <VerificationBanner macro="verified" t={t}>
              {renter && <RenterSummary renter={renter} t={t} />}
            </VerificationBanner>
          )}
        </div>
      )}
    </StepShell>
  );
}

function VerificationBanner({
  macro,
  t,
  children,
}: {
  macro: Exclude<MacroVerification, 'idle'>;
  t: (k: string) => string;
  children: ReactNode;
}) {
  const skin =
    macro === 'verified'
      ? {
          ring: 'ring-success-500/25',
          bg: 'bg-success-50',
          dot: 'bg-success-500',
          text: 'text-success-700',
          icon: <BadgeCheckIcon size={12} />,
        }
      : macro === 'pending'
        ? {
            ring: 'ring-lavender-200',
            bg: 'bg-lavender-50',
            dot: 'bg-lavender-400',
            text: 'text-lavender-700',
            icon: <ClockIcon size={12} />,
          }
        : {
            ring: 'ring-warn-500/25',
            bg: 'bg-warn-50',
            dot: 'bg-warn-500',
            text: 'text-warn-700',
            icon: <AlertIcon size={12} />,
          };

  return (
    <div className={cn('rounded-xl2 ring-1', skin.bg, skin.ring, 'p-3.5 space-y-2.5')}>
      <div className={cn('inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]', skin.text)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', skin.dot)} />
        {skin.icon}
        {t(`merchant.session.verify.macro.${macro}.label`)}
      </div>
      {children}
    </div>
  );
}

function RenterSummary({
  renter,
  t,
}: {
  renter: ProfileRow;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl2 bg-white ring-1 ring-canvas-200 p-3">
      <span className="h-10 w-10 shrink-0 rounded-2xl bg-canvas-100 ring-1 ring-lavender-200 text-lavender-700 grid place-items-center">
        <UserIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {renter.full_name}
        </div>
        <div className="text-[11.5px] text-ink-400 num truncate">
          {renter.mobile ?? '—'}{renter.city ? ` · ${renter.city}` : ''}
        </div>
      </div>
      {renter.nafath_verified_at && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-lavender-50 ring-1 ring-inset ring-lavender-200 rounded-full px-1.5 py-0.5">
          <BadgeCheckIcon size={10} />
          {t('merchant.session.verify.nafathBadge')}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

function OperationCard({
  t,
  operation,
  setOperation,
  merchantPrimaryCategory,
  rentalAmount,
  originalItemValue,
  formatCurrency,
  formatDate,
  locale,
  active,
  locked,
  loading,
  error,
  onContinue,
  nowMs,
}: {
  t: (k: string) => string;
  operation: OperationDraft;
  setOperation: (patch: Partial<OperationDraft>) => void;
  merchantPrimaryCategory: RentalCategoryDB | null;
  rentalAmount: number;
  originalItemValue: number;
  formatCurrency: (n: number) => string;
  formatDate: (v: string) => string;
  locale: 'ar' | 'en';
  active: boolean;
  locked: boolean;
  loading: boolean;
  error: string | null;
  onContinue: () => void;
  nowMs: number;
}) {
  // Computed end. Recomputes every render (cheap) — no memo needed.
  const rentalEnd = computeRentalEnd(operation.startsAt, operation.rentalDays);
  const parsedStart = parseDateTimeLocal(operation.startsAt);
  const startInvalid = !parsedStart;
  // Business rule: starts_at > now(). datetime-local has minute
  // granularity, so the current minute (:00) is <= now (has seconds) and
  // is correctly treated as past. `nowMs` ticks so this advances live.
  const startPast = parsedStart !== null && parsedStart.getTime() <= nowMs;
  const minDateTime = dateTimeInputFrom(nowMs);
  const startError = startInvalid
    ? t('merchant.session.operation.startsAtRequired')
    : startPast
      ? t('merchant.session.operation.startsAtPast')
      : undefined;
  return (
    <StepShell
      number={2}
      title={t('merchant.session.operation.title')}
      hint={!active && !locked ? t('merchant.session.operation.hint') : undefined}
      active={active}
      locked={locked}
    >
      {locked && (
        <div className="space-y-1.5 text-[12.5px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-500 truncate">{operation.itemName}</span>
            <span className="font-semibold text-ink-900 num">
              {formatCurrency(rentalAmount)}
            </span>
          </div>
          <div className="text-[11.5px] text-ink-400 num">
            {t('merchant.session.operation.summary')
              .replace('{days}', String(Math.max(Number(operation.rentalDays) || 1, 1)))
              .replace('{rate}', formatCurrency(Number(operation.dailyRate) || 0))}
          </div>
          {parseDateTimeLocal(operation.startsAt) && rentalEnd && (
            <div className="text-[11.5px] text-ink-500 num">
              {formatDate(parseDateTimeLocal(operation.startsAt)!.toISOString())}
              {' → '}
              {formatDate(rentalEnd.toISOString())}
            </div>
          )}
          <div className="text-[11.5px] text-ink-500 num pt-1">
            {t('merchant.session.operation.itemValueSummary').replace(
              '{value}',
              formatCurrency(originalItemValue),
            )}
          </div>
        </div>
      )}

      {active && (
        <div className="space-y-4">
          <FormField label={t('merchant.session.operation.itemLabel')} required>
            <Input
              value={operation.itemName}
              onChange={(e) => setOperation({ itemName: e.target.value })}
              placeholder={t('merchant.session.operation.itemPlaceholder')}
            />
          </FormField>

          <FormField
            label={t('merchant.session.operation.startsAtLabel')}
            required
            hint={!startError ? t('merchant.session.operation.startsAtHint') : undefined}
            error={startError}
          >
            <Input
              type="datetime-local"
              dir="ltr"
              value={operation.startsAt}
              min={minDateTime}
              onChange={(e) => setOperation({ startsAt: e.target.value })}
              invalid={Boolean(startError)}
              className="num text-left"
            />
          </FormField>

          {rentalEnd && (
            <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {t('merchant.session.operation.endsAtLabel')}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold num text-ink-900 leading-tight">
                {rentalEnd.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </div>
              <div className="mt-1 text-[10.5px] text-ink-400">
                {t('merchant.session.operation.endsAtHint')}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('merchant.session.operation.categoryLabel')} required>
              <Select
                value={operation.category}
                onChange={(e) =>
                  setOperation({ category: e.target.value as RentalCategoryDB })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`stores.filters.${c}s`)}
                  </option>
                ))}
              </Select>
              {merchantPrimaryCategory && operation.category !== merchantPrimaryCategory && (
                <div className="mt-1 text-[10.5px] text-ink-400">
                  {t('merchant.session.operation.categoryHint')}
                </div>
              )}
            </FormField>
            <FormField label={t('merchant.session.operation.daysLabel')} required>
              <NumericField
                inputMode="numeric"
                value={operation.rentalDays}
                onValueChange={(v) => setOperation({ rentalDays: v })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('merchant.session.operation.rateLabel')} required>
              <NumericField
                inputMode="decimal"
                digitsOnly="decimal"
                value={operation.dailyRate}
                onValueChange={(v) => setOperation({ dailyRate: v })}
                trailing={
                  <span className="text-ink-400 text-[12px] font-medium">
                    {t('common.sar')}
                  </span>
                }
              />
            </FormField>
            <FormField
              label={t('merchant.session.operation.itemValueLabel')}
              required
              hint={t('merchant.session.operation.itemValueHint')}
            >
              <NumericField
                inputMode="decimal"
                digitsOnly="decimal"
                value={operation.originalItemValue}
                onValueChange={(v) => setOperation({ originalItemValue: v })}
                placeholder="0"
                trailing={
                  <span className="text-ink-400 text-[12px] font-medium">
                    {t('common.sar')}
                  </span>
                }
              />
            </FormField>
          </div>

          {/* Two amounts — kept visually distinct so the merchant sees
              the rental fee separate from the original item value. */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {t('merchant.session.operation.rentalAmountLabel')}
              </div>
              <div className="mt-0.5 editorial-title text-[18px] num text-ink-900 leading-none">
                {formatCurrency(rentalAmount)}
              </div>
              <div className="mt-1 text-[10.5px] text-ink-400">
                {t('merchant.session.operation.rentalAmountHint')}
              </div>
            </div>
            <div className="rounded-xl2 bg-lavender-50/60 ring-1 ring-lavender-200/60 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-lavender-700">
                {t('merchant.session.operation.itemValueTileLabel')}
              </div>
              <div className="mt-0.5 editorial-title text-[18px] num text-ink-900 leading-none">
                {formatCurrency(originalItemValue)}
              </div>
              <div className="mt-1 text-[10.5px] text-lavender-700/80">
                {t('merchant.session.operation.itemValueTileHint')}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            block
            onClick={onContinue}
            loading={loading}
            disabled={
              !operation.itemName.trim() ||
              !(Number(operation.dailyRate) > 0) ||
              !(Number(operation.rentalDays) >= 1) ||
              !(Number(operation.originalItemValue) > 0) ||
              startInvalid ||
              startPast ||
              !rentalEnd ||
              (rentalEnd?.getTime() ?? 0) <= (parsedStart?.getTime() ?? 0)
            }
          >
            {t('merchant.session.operation.continueCta')}
          </Button>
        </div>
      )}
    </StepShell>
  );
}

// ---------------------------------------------------------------------

function EligibilityCard({
  t,
  verdict,
  issuing,
  issueError,
  issueDisabled,
  active,
  locked,
  onIssue,
  onReduce,
  onCancel,
}: {
  t: (k: string) => string;
  verdict: EligibilityVerdict;
  rentalAmount: number;
  originalItemValue: number;
  formatCurrency: (n: number) => string;
  issuing: boolean;
  issueError: string | null;
  issueDisabled: boolean;
  active: boolean;
  locked: boolean;
  onIssue: () => void;
  onReduce: () => void;
  onCancel: () => void;
}) {
  // Merchant-facing outcome only. No customer financial figures.
  const outcome: 'approved' | 'insufficient' | 'review' =
    verdict.status === 'approved'
      ? 'approved'
      : verdict.status === 'insufficient'
        ? 'insufficient'
        : 'review';

  const tone =
    outcome === 'approved' ? 'success' : outcome === 'insufficient' ? 'danger' : 'warn';

  return (
    <StepShell
      number={3}
      title={t('merchant.session.eligibility.title')}
      hint={!active && !locked ? t('merchant.session.eligibility.hint') : undefined}
      active={active}
      locked={locked}
    >
      {(active || locked) && (
        <div className="space-y-3">
          <div
            className={cn(
              'rounded-xl2 px-4 py-3.5 ring-1 flex items-center gap-3',
              tone === 'success' && 'bg-success-50 ring-success-500/20 text-success-700',
              tone === 'danger' && 'bg-danger-50 ring-danger-500/20 text-danger-700',
              tone === 'warn' && 'bg-warn-50 ring-warn-500/20 text-warn-700',
            )}
          >
            <span
              className={cn(
                'h-9 w-9 shrink-0 rounded-xl grid place-items-center ring-1 bg-white',
                tone === 'success' && 'text-success-600 ring-success-500/20',
                tone === 'danger' && 'text-danger-600 ring-danger-500/20',
                tone === 'warn' && 'text-warn-600 ring-warn-500/20',
              )}
            >
              {outcome === 'approved' ? <BadgeCheckIcon size={16} /> : <ClockIcon size={16} />}
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">
                {t(`merchant.session.eligibility.verdict.${outcome}`)}
              </div>
              {/* The eligible (approved) state needs no helper line — the
                  status + badge + CTA are self-explanatory. Insufficient /
                  review keep their guidance. */}
              {outcome !== 'approved' && (
                <div className="mt-0.5 text-[12px] opacity-80 leading-relaxed">
                  {t(`merchant.session.eligibility.verdict.${outcome}Hint`)}
                </div>
              )}
            </div>
          </div>

          {active && outcome === 'approved' && (
            <>
              {issueError && (
                <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
                  {issueError}
                </div>
              )}
              <Button
                variant="primary"
                size="lg"
                block
                onClick={onIssue}
                loading={issuing}
                disabled={issuing || issueDisabled}
                leading={<DocIcon size={16} />}
              >
                {t('merchant.session.eligibility.issuePackageCta')}
              </Button>
            </>
          )}

          {active && outcome === 'insufficient' && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md" onClick={onReduce}>
                {t('merchant.session.eligibility.reduceCta')}
              </Button>
              <Button variant="ghost" size="md" onClick={onCancel}>
                {t('merchant.session.eligibility.cancelCta')}
              </Button>
            </div>
          )}

          {active && outcome === 'review' && (
            <div className="grid grid-cols-1">
              <Button variant="ghost" size="md" onClick={onCancel}>
                {t('merchant.session.eligibility.cancelCta')}
              </Button>
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}

// ---------------------------------------------------------------------
// Contract overrides — clamp helpers
// ---------------------------------------------------------------------

function clampLightFraction(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0.3;
  // Input is in PERCENT (0..100). Convert to fraction (0..1) and clamp.
  return Math.min(Math.max(n / 100, 0.01), 1);
}

function clampLateMultiplier(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1.5;
  return Math.min(Math.max(n, 0.1), 10);
}

// ---------------------------------------------------------------------
// ContractCard — merchant-side contract preparation + preview.
// Sits between Eligibility and Issued. Shows a small editable form for
// the two adjustable terms (light damage % and late return multiplier)
// followed by a live preview of every clause the customer will see.
// The "Issue rental package" CTA actually creates the invoice + items,
// passing the overrides through createInvoiceWithItems.
// ---------------------------------------------------------------------

function ContractCard({
  t,
  dir,
  operation,
  setOperation,
  merchant,
  rentalAmount,
  originalItemValue,
  formatCurrency,
  active,
  locked,
  issuing,
  issueError,
  issueDisabled,
  onIssue,
}: {
  t: (k: string, p?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
  operation: OperationDraft;
  setOperation: (patch: Partial<OperationDraft>) => void;
  merchant: MerchantRow | null;
  rentalAmount: number;
  originalItemValue: number;
  formatCurrency: (n: number) => string;
  active: boolean;
  locked: boolean;
  issuing: boolean;
  issueError: string | null;
  issueDisabled: boolean;
  onIssue: () => void;
}) {
  const { locale } = useI18n();
  const days = Math.max(Number(operation.rentalDays) || 1, 1);
  const dailyRate = Number(operation.dailyRate) || 0;
  const lightFrac = clampLightFraction(operation.lightDamagePercent);
  const lateMult = clampLateMultiplier(operation.lateReturnMultiplier);

  // Synthesize the minimum invoice/items shape the template needs so
  // we can preview the EXACT clauses the customer will receive.
  const previewClauses = buildContractFromTemplate({
    invoice: {
      // Only the fields the template touches need real values; the
      // rest are filled with safe placeholders.
      id: 'preview',
      invoice_number: 'PREVIEW',
      merchant_id: merchant?.id ?? 'preview',
      branch_id: null,
      customer_user_id: 'preview',
      subtotal_amount: rentalAmount,
      tax_amount: 0,
      security_deposit: 0,
      total_amount: rentalAmount,
      original_item_value: originalItemValue,
      light_damage_fraction: lightFrac,
      late_return_multiplier: lateMult,
      status: 'issued',
      issued_at: new Date().toISOString(),
      expires_at: null,
      starts_at: null,
      scan_token: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    items: [
      {
        id: 'preview-item',
        invoice_id: 'preview',
        position: 0,
        item_name: operation.itemName,
        category: operation.category,
        size_label: null,
        color: null,
        daily_rate: dailyRate,
        rental_days: days,
        subtotal: rentalAmount,
        replacement_value: originalItemValue,
        notes: null,
        created_at: new Date().toISOString(),
      },
    ],
    merchant: merchant ?? null,
    pickupDate: new Date().toISOString(),
    returnDate: new Date(Date.now() + days * 86_400_000).toISOString(),
    durationDays: days,
    lightDamageFraction: lightFrac,
    lateReturnMultiplier: lateMult,
  }).clauses;

  const lightDamageAmount = Math.round(originalItemValue * lightFrac);
  const latePerDay = Math.round(dailyRate * lateMult);

  return (
    <StepShell
      number={4}
      title={t('merchant.session.contract.title')}
      hint={!active && !locked ? t('merchant.session.contract.hint') : undefined}
      active={active}
      locked={locked}
    >
      {(active || locked) && (
        <div className="space-y-4">
          {/* Adjustable terms */}
          {active && (
            <section className="rounded-xl2 bg-canvas-100/60 ring-1 ring-canvas-200 p-4 space-y-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {t('merchant.session.contract.adjustableTitle')}
              </div>

              <FormField label={t('merchant.session.contract.lightDamageLabel')}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={100}
                    step={1}
                    value={operation.lightDamagePercent}
                    onChange={(e) =>
                      setOperation({ lightDamagePercent: e.target.value })
                    }
                  />
                  <span className="text-[12px] font-semibold text-ink-500 num">
                    {t('merchant.session.contract.lightDamageUnit')}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-500 leading-relaxed">
                  {t('merchant.session.contract.lightDamageHint')}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-700 num">
                  {t('merchant.session.contract.lightDamagePreview', {
                    amount: formatCurrency(lightDamageAmount),
                  })}
                </div>
              </FormField>

              <FormField label={t('merchant.session.contract.lateReturnLabel')}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={operation.lateReturnMultiplier}
                    onChange={(e) =>
                      setOperation({ lateReturnMultiplier: e.target.value })
                    }
                  />
                  <span className="text-[12px] font-semibold text-ink-500 num">
                    {t('merchant.session.contract.lateReturnUnit')}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-500 leading-relaxed">
                  {t('merchant.session.contract.lateReturnHint')}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-700 num">
                  {t('merchant.session.contract.lateReturnPreview', {
                    amount: formatCurrency(latePerDay),
                  })}
                </div>
              </FormField>
            </section>
          )}

          {/* Quick summary tiles */}
          <div className="grid grid-cols-2 gap-2">
            <PreviewTile
              label={t('merchant.session.contract.summary.rentalPeriod')}
              value={t('merchant.session.contract.summary.rentalPeriodValue', { days })}
            />
            <PreviewTile
              label={t('merchant.session.contract.summary.rentalFee')}
              value={formatCurrency(rentalAmount)}
            />
            <PreviewTile
              label={t('merchant.session.contract.summary.itemValue')}
              value={formatCurrency(originalItemValue)}
            />
            <PreviewTile
              label={t('merchant.session.contract.summary.lightDamage')}
              value={formatCurrency(lightDamageAmount)}
            />
            <PreviewTile
              label={t('merchant.session.contract.summary.fullDamage')}
              value={formatCurrency(originalItemValue)}
            />
            <PreviewTile
              label={t('merchant.session.contract.summary.lateReturnPerDay')}
              value={formatCurrency(latePerDay)}
            />
          </div>

          {/* Full preview clauses */}
          <section className="rounded-xl2 bg-white hairline shadow-soft p-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-lavender-700">
              {t('merchant.session.contract.previewTitle')}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-500 leading-relaxed">
              {t('merchant.session.contract.previewSubtitle')}
            </div>
            <ol className="mt-3 space-y-3">
              {previewClauses.map((c) => (
                <li key={c.id}>
                  <div className="text-[11.5px] font-semibold text-ink-900 tracking-tight">
                    {c.title[locale]}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-600 leading-relaxed">
                    {c.body[locale]}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {active && (
            <>
              {issueError && (
                <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
                  {issueError}
                </div>
              )}
              <Button
                variant="primary"
                size="lg"
                block
                onClick={onIssue}
                loading={issuing}
                disabled={issuing || issueDisabled}
                leading={<DocIcon size={16} />}
              >
                {t('merchant.session.contract.issuePackageCta', {
                  amount: formatCurrency(rentalAmount),
                })}
              </Button>
            </>
          )}
        </div>
      )}
    </StepShell>
  );
}

function PreviewTile({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white hairline px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400 truncate">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-bold text-ink-900 num truncate">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Handoff — the in-store session is over; the documented journey begins.
// This card names that transition explicitly.
// ---------------------------------------------------------------------

function HandoffCard({
  t,
  invoice,
  renter,
  navigate,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
  invoice: RentalInvoiceRow;
  renter: ProfileRow | null;
  navigate: (path: string) => void;
}) {
  // Design M11 — centered success layout. Real invoice reference only;
  // the approved four-stage journey with stage 2 (مراجعة العميل)
  // current. No payment / note / Nafath mentions.
  const { locale } = useI18n();
  const STAGE_KEYS = [
    'journey.stages.request',
    'journey.stages.review',
    'journey.stages.started',
    'journey.stages.closure',
  ];
  const CURRENT = 1; // stage 2 of 4 — customer review
  return (
    <div className="flex flex-col items-center pt-6 animate-reveal-up">
      <span className="h-[84px] w-[84px] rounded-full bg-green-700 text-white grid place-items-center ring-[14px] ring-green-50">
        <CheckIcon size={34} strokeWidth={2.5} />
      </span>
      <h3 className="mt-6 text-[21px] font-bold text-navy-700 text-center">
        {t('merchant.session.handoff.title')}
      </h3>
      <p className="mt-2 text-[13.5px] text-ink-600 text-center leading-[1.9] max-w-[280px]">
        {renter?.full_name
          ? t('merchant.session.handoff.bodyNamed', { name: renter.full_name })
          : t('merchant.session.handoff.body')}
      </p>
      {/* System one-hour expiry (20260502123800) — the merchant sees
          the same persisted deadline the customer sees. */}
      {formatValidUntil(invoice.expires_at, locale) && (
        <p className="mt-2 text-[12.5px] font-semibold text-warn-700 num text-center">
          {t('merchant.session.handoff.validUntil', {
            dateTime: formatValidUntil(invoice.expires_at, locale)!,
          })}
        </p>
      )}

      {/* Reference card: request number + review chip + stage dots */}
      <div className="mt-5 w-full rounded-[14px] bg-white ring-1 ring-beige-200 p-[18px]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11.5px] text-ink-500">
              {t('merchant.session.handoff.requestNumberLabel')}
            </div>
            <div className="mt-0.5 text-[14px] font-bold num truncate" dir="ltr">
              {invoice.invoice_number}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-warn-50 text-warn-600 px-3 py-1.5 text-[11.5px] font-bold">
            {t('merchant.session.handoff.statusChip')}
          </span>
        </div>
        <div className="mt-4 flex items-center" aria-hidden>
          {STAGE_KEYS.map((_, i) => (
            <span key={i} className="contents">
              <span
                className={cn(
                  'shrink-0 rounded-full',
                  i < CURRENT
                    ? 'h-3 w-3 bg-green-700'
                    : i === CURRENT
                      ? 'h-4 w-4 bg-white border-[3px] border-green-500'
                      : 'h-3 w-3 bg-navy-100/60',
                )}
              />
              {i < STAGE_KEYS.length - 1 && (
                <span
                  className={cn(
                    'flex-1 h-[2.5px]',
                    i < CURRENT ? 'bg-green-700' : 'bg-navy-100/60',
                  )}
                />
              )}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] font-semibold text-green-700">
          {t('merchant.session.handoff.stageLine', {
            current: CURRENT + 1,
            total: STAGE_KEYS.length,
            stage: t(STAGE_KEYS[CURRENT]),
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/merchant/rentals?filter=review')}
        className="mt-[18px] w-full h-13 rounded-xl2 bg-navy-700 text-white font-bold text-[14.5px] hover:bg-navy-800 transition-colors"
      >
        {t('merchant.session.handoff.viewRentals')}
      </button>
      <button
        type="button"
        onClick={() => navigate('/merchant/home')}
        className="mt-4 text-[13.5px] font-bold text-green-700 hover:text-green-800"
      >
        {t('merchant.session.handoff.doneCta')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Demo-mode fallback note: when supabaseConfigured is false, we still
// render a fully clickable flow using fixture data inside the action
// handlers (see handleLookupRenter / handleOperationContinue). This
// preserves the demo-safe behaviour pattern used elsewhere in the app.
// ---------------------------------------------------------------------

void InfoIcon; // keep imports stable when verifyNotFound copy moves around