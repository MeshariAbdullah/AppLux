import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input, Select } from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  InfoIcon,
  PhoneIcon,
  ReceiptIcon,
  ShieldIcon,
  SparkleIcon,
  UserIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import {
  createInvoiceWithItems,
  fetchEligibility,
  fetchMyMerchant,
  useSupabaseAuth,
  type ProfileRow,
  type RentalCategoryDB,
  type RentalEligibilityRow,
  type RentalInvoiceRow,
} from '@/lib/supabase';
import { lookupRenterByMobile, sendOtp, verifyOtp, OtpError } from '@/lib/otp';
import {
  classifyMobile,
  maskMobile,
  normalizeMobile,
  type MobileIssue,
} from '@/lib/mobile';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { deriveJourneyFromInvoice } from '@/lib/rentalJourney';
import { cn } from '@/lib/cn';

// =====================================================================
// Dev-only demo fallback. Production builds (`vite build`) set
// import.meta.env.DEV to false, which lets Vite tree-shake every branch
// gated on this flag. In configured live mode this is never reached.
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

type SessionStep = 'start' | 'verify' | 'operation' | 'eligibility' | 'issued';

/**
 * Granular verification status the placeholder OTP machine flows through.
 * Macro-grouped for display by `macroVerificationState` below.
 */
type VerificationStatus =
  | 'unverified'   // mobile field empty / has not been searched yet
  | 'looking_up'   // querying profiles by mobile
  | 'not_found'    // no profile matches; renter must complete account first
  | 'found'        // profile matched; waiting for OTP confirmation
  | 'otp_sent'     // placeholder code "sent" — UI shows the confirm step
  | 'verified';    // identity confirmed for this session

/** Three macro states the merchant + renter actually need to see. */
type MacroVerification =
  | 'idle'           // nothing meaningful yet
  | 'verified'       // renter exists AND identity confirmed for this session
  | 'pending'        // renter exists, verification in progress (looking up / OTP)
  | 'not_found';     // renter does NOT exist — must complete account first

type VerifyState = {
  mobile: string;
  otp: string;
  status: VerificationStatus;
  renter: ProfileRow | null;
  error: string | null;
};

type OperationDraft = {
  itemName: string;
  category: RentalCategoryDB;
  rentalDays: string;     // strings for input ergonomics; coerced on use
  dailyRate: string;
  originalItemValue: string;
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
    otp: '',
    status: 'unverified',
    renter: null,
    error: null,
  },
  operation: {
    itemName: '',
    category: 'dress',
    rentalDays: '1',
    dailyRate: '',
    originalItemValue: '',
  },
  eligibility: { row: null, loading: false, error: null },
  issue: { invoice: null, submitting: false, error: null },
};

const CATEGORIES: RentalCategoryDB[] = ['dress', 'bag', 'watch', 'bisht'];
const STEPS: SessionStep[] = ['start', 'verify', 'operation', 'eligibility', 'issued'];

// ---------------------------------------------------------------------

function macroVerificationState(s: VerificationStatus): MacroVerification {
  if (s === 'verified') return 'verified';
  if (s === 'not_found') return 'not_found';
  if (s === 'found' || s === 'otp_sent' || s === 'looking_up') return 'pending';
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
  const remaining = Math.max(limit - used, 0);
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
  const { dir, formatCurrency } = useI18n();
  const navigate = useNavigate();
  const supabaseAuth = useSupabaseAuth();

  const [session, setSession] = useState<SessionState>(INITIAL_SESSION);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [merchantPrimaryCategory, setMerchantPrimaryCategory] =
    useState<RentalCategoryDB | null>(null);

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

  // Pull the signed-in merchant once.
  useEffect(() => {
    const userId = supabaseAuth.session?.user?.id;
    if (!supabaseAuth.configured || !userId) return;
    let cancelled = false;
    fetchMyMerchant(userId)
      .then((m) => {
        if (cancelled || !m) return;
        setMerchantId(m.id);
        setMerchantPrimaryCategory(m.primary_category);
        setSession((s) =>
          s.operation.category === 'dress'
            ? { ...s, operation: { ...s.operation, category: m.primary_category } }
            : s,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supabaseAuth.configured, supabaseAuth.session?.user?.id]);

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
        updateVerify({
          status: 'found',
          renter: {
            id: 'dev-renter',
            full_name: '[dev] Renter',
            mobile: normalized.canonical,
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
        updateVerify({ status: 'not_found', renter: null });
        return;
      }
      // EXISTENCE-ONLY at this point — by policy we do NOT surface the
      // renter's name, city, or other details to the merchant until the
      // OTP succeeds. The renter object stays null; the verify card
      // shows a generic "Renter is registered" panel.
      updateVerify({ status: 'found', renter: null });
    } catch (err) {
      // Backend or network error — don't surface the raw provider message;
      // give the merchant a calm, actionable line.
      console.error('[verify] lookupRenterByMobile failed', err);
      updateVerify({
        status: 'unverified',
        error: t('merchant.session.verify.errors.mobileVerifyFailed'),
      });
    }
  };

  const handleSendCode = async () => {
    // We only need the existence check to have succeeded — the renter
    // object stays null until OTP verification. Send to the typed
    // mobile (already canonicalized by the lookup step).
    if (session.verify.status !== 'found' && session.verify.status !== 'otp_sent') return;
    updateVerify({ error: null });
    // Defense-in-depth: even though the lookup step already canonicalized
    // the number, re-classify here so a tampered field cannot trigger an
    // SMS send for a malformed number.
    const classification = classifyMobile(session.verify.mobile);
    if (classification.kind !== 'valid') {
      updateVerify({ error: verifyMobileIssueMessage(classification.issue, t) });
      return;
    }

    if (!supabaseAuth.configured) {
      if (DEV_DEMO_FALLBACK) {
        await new Promise((r) => window.setTimeout(r, 300));
        updateVerify({ status: 'otp_sent' });
        return;
      }
      updateVerify({ error: t('merchant.session.verify.errors.backendRequired') });
      return;
    }

    try {
      await sendOtp(session.verify.mobile);
      updateVerify({ status: 'otp_sent' });
    } catch (err) {
      const message =
        err instanceof OtpError && err.code === 'twilio_not_configured'
          ? t('merchant.session.verify.errors.providerOffline')
          : err instanceof Error
            ? err.message
            : t('merchant.session.verify.errors.sendFailed');
      updateVerify({ error: message });
    }
  };

  const handleConfirmCode = async () => {
    // The OTP verify endpoint is itself the renter-identity gate. Still,
    // we re-classify the mobile here so a malformed value never reaches
    // the SMS provider (defense-in-depth — the lookup step normally
    // catches this first).
    const classification = classifyMobile(session.verify.mobile);
    if (classification.kind !== 'valid') {
      updateVerify({ error: verifyMobileIssueMessage(classification.issue, t) });
      return;
    }
    const trimmed = session.verify.otp.replace(/\D/g, '');
    if (trimmed.length < 4) {
      updateVerify({ error: t('merchant.session.verify.errors.codeShort') });
      return;
    }

    if (!supabaseAuth.configured) {
      if (DEV_DEMO_FALLBACK) {
        // Synthesize a renter only at verification time, mirroring the
        // production flow where renter details are exclusively revealed
        // after a successful OTP check.
        updateVerify({
          status: 'verified',
          error: null,
          renter: {
            id: 'dev-renter',
            full_name: '[dev] Renter',
            mobile: normalizeMobile(session.verify.mobile)?.canonical ?? null,
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
      const result = await verifyOtp(session.verify.mobile, trimmed);
      if (!result.verified) {
        updateVerify({ error: t('merchant.session.verify.errors.codeFailed') });
        return;
      }
      // The verify endpoint is authoritative for the renter identity —
      // overwrite the lookup-RPC snapshot with what Twilio + the
      // service-role-keyed fetch returned (mobile is guaranteed canonical
      // server-side; this is the renter we just confirmed by OTP).
      if (result.renter) {
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
      } else {
        updateVerify({ status: 'verified', error: null });
      }
      setStep('operation');
    } catch (err) {
      const message =
        err instanceof OtpError && err.code === 'twilio_not_configured'
          ? t('merchant.session.verify.errors.providerOffline')
          : err instanceof Error
            ? err.message
            : t('merchant.session.verify.errors.codeFailed');
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
      const row = await fetchEligibility(session.verify.renter.id);
      updateEligibility({ row, loading: false, error: null });
      setStep('eligibility');
    } catch (err) {
      updateEligibility({
        loading: false,
        error: err instanceof Error ? err.message : t('merchant.session.eligibility.errors.fetch'),
      });
    }
  };

  const handleIssue = async () => {
    if (verdict.status !== 'approved' || !session.verify.renter) return;

    const rate = Number(session.operation.dailyRate) || 0;
    const days = Math.max(Number(session.operation.rentalDays) || 1, 1);
    const rentalFee = rate * days;
    const itemValue = Number(session.operation.originalItemValue) || 0;

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
          status: 'issued',
          issued_at: now,
          expires_at: null,
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
      updateIssue({ invoice: result.invoice, submitting: false, error: null });
      setStep('issued');
    } catch (err) {
      updateIssue({
        submitting: false,
        error: err instanceof Error ? err.message : 'Failed to issue rental package.',
      });
    }
  };

  // ---------------- Render ----------------

  const stepIndex = STEPS.indexOf(session.step);

  return (
    <>
      <Header title={t('merchant.session.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <SessionEyebrow stepIndex={stepIndex} t={t} />

          {session.step === 'start' && <StartCard t={t} onBegin={handleStart} />}

          {session.step !== 'start' && (
            <VerifyCard
              t={t}
              dir={dir}
              status={session.verify.status}
              macro={macroVerify}
              mobile={session.verify.mobile}
              setMobile={(v) => {
                // Editing the mobile invalidates a prior lookup, but keep
                // the field stable when the user is just typing characters.
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
                  error: null,
                });
              }}
              renter={session.verify.renter}
              otp={session.verify.otp}
              setOtp={(v) => updateVerify({ otp: v })}
              verifyError={session.verify.error}
              onLookup={handleLookupRenter}
              onSendCode={handleSendCode}
              onConfirmCode={handleConfirmCode}
              active={session.step === 'verify'}
              locked={session.step !== 'verify' && session.verify.status === 'verified'}
            />
          )}

          {(session.step === 'operation' ||
            session.step === 'eligibility' ||
            session.step === 'issued') && (
            <OperationCard
              t={t}
              operation={session.operation}
              setOperation={updateOperation}
              merchantPrimaryCategory={merchantPrimaryCategory}
              rentalAmount={rentalAmount}
              originalItemValue={originalItemValue}
              formatCurrency={formatCurrency}
              active={session.step === 'operation'}
              locked={session.step === 'eligibility' || session.step === 'issued'}
              loading={session.eligibility.loading}
              error={session.eligibility.error}
              onContinue={handleOperationContinue}
            />
          )}

          {(session.step === 'eligibility' || session.step === 'issued') && (
            <EligibilityCard
              t={t}
              verdict={verdict}
              rentalAmount={rentalAmount}
              originalItemValue={originalItemValue}
              formatCurrency={formatCurrency}
              issuing={session.issue.submitting}
              issueError={session.issue.error}
              issueDisabled={supabaseAuth.configured && !merchantId}
              active={session.step === 'eligibility'}
              locked={session.step === 'issued'}
              onIssue={handleIssue}
              onReduce={() => setStep('operation')}
              onCancel={() => navigate('/merchant/home')}
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
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-lavender-700">
        {t('merchant.session.eyebrow')}
      </div>
      <div className="text-[11px] text-ink-400 num">
        {t('merchant.session.stepCounter', {
          current: currentNumber,
          total: numberedTotal,
        })}
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
        'rounded-xl3 bg-white hairline p-5 shadow-soft transition-opacity',
        locked && 'opacity-70',
        active && 'ring-1 ring-lavender-300/70',
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'relative h-9 w-9 shrink-0 rounded-full grid place-items-center text-[12.5px] font-semibold num',
            locked
              ? 'bg-lavender-400 text-white'
              : active
                ? 'bg-white ring-2 ring-lavender-400 text-lavender-700 shadow-[0_0_0_4px_rgba(164,141,218,0.18)]'
                : 'bg-canvas-100 text-ink-500 ring-1 ring-canvas-200',
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
  return (
    <section className="rounded-xl3 bg-gradient-to-br from-lavender-300 via-lavender-400 to-lavender-500 text-white p-6 shadow-plush overflow-hidden relative">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 end-[-12%] h-44 w-44 rounded-full bg-white/15 blur-3xl"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 ring-1 ring-white/25 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
          <SparkleIcon size={11} />
          {t('merchant.session.start.eyebrow')}
        </span>
        <h2 className="mt-4 editorial-title text-[22px] leading-tight">
          {t('merchant.session.start.title')}
        </h2>
        <p className="mt-2.5 text-[13px] text-white/80 leading-relaxed max-w-[36ch]">
          {t('merchant.session.start.body')}
        </p>
        <Button
          variant="secondary"
          size="lg"
          block
          className="mt-5 bg-white text-lavender-700 hover:bg-white/95"
          onClick={onBegin}
        >
          {t('merchant.session.start.cta')}
        </Button>
      </div>
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
  otp,
  setOtp,
  verifyError,
  onLookup,
  onSendCode,
  onConfirmCode,
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
  otp: string;
  setOtp: (v: string) => void;
  verifyError: string | null;
  onLookup: () => void;
  onSendCode: () => void;
  onConfirmCode: () => void;
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
              at this stage. Only after OTP confirmation does the
              name surface. */}
          {(status === 'found' || status === 'otp_sent') && (
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
                          normalizeMobile(mobile)?.canonical ?? mobile,
                        ),
                      })}
                    </div>
                  </div>
                </div>
              </VerificationBanner>
              {status === 'found' && (
                <Button variant="primary" size="lg" block onClick={onSendCode}>
                  {t('merchant.session.verify.sendCodeCta', {
                    mask: maskMobile(
                      normalizeMobile(mobile)?.canonical ?? mobile,
                    ),
                  })}
                </Button>
              )}
              {status === 'otp_sent' && (
                <>
                  <FormField
                    label={t('merchant.session.verify.codeLabel')}
                    hint={t('merchant.session.verify.codeHint', {
                      mask: maskMobile(
                        normalizeMobile(mobile)?.canonical ?? mobile,
                      ),
                    })}
                  >
                    <Input
                      inputMode="numeric"
                      placeholder="1234"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                      leading={<ShieldIcon size={14} className="text-lavender-600" />}
                    />
                  </FormField>
                  {verifyError && (
                    <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
                      {verifyError}
                    </div>
                  )}
                  <Button variant="primary" size="lg" block onClick={onConfirmCode}>
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
  active,
  locked,
  loading,
  error,
  onContinue,
}: {
  t: (k: string) => string;
  operation: OperationDraft;
  setOperation: (patch: Partial<OperationDraft>) => void;
  merchantPrimaryCategory: RentalCategoryDB | null;
  rentalAmount: number;
  originalItemValue: number;
  formatCurrency: (n: number) => string;
  active: boolean;
  locked: boolean;
  loading: boolean;
  error: string | null;
  onContinue: () => void;
}) {
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
              <Input
                inputMode="numeric"
                value={operation.rentalDays}
                onChange={(e) => setOperation({ rentalDays: e.target.value })}
                className="num"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('merchant.session.operation.rateLabel')} required>
              <Input
                inputMode="decimal"
                value={operation.dailyRate}
                onChange={(e) => setOperation({ dailyRate: e.target.value })}
                className="num"
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
              <Input
                inputMode="decimal"
                value={operation.originalItemValue}
                onChange={(e) => setOperation({ originalItemValue: e.target.value })}
                className="num"
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
              !(Number(operation.originalItemValue) > 0)
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
  rentalAmount,
  originalItemValue,
  formatCurrency,
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
  const verdictTone =
    verdict.status === 'approved'
      ? 'success'
      : verdict.status === 'insufficient'
        ? 'danger'
        : 'warn';

  return (
    <StepShell
      number={3}
      title={t('merchant.session.eligibility.title')}
      hint={!active && !locked ? t('merchant.session.eligibility.hint') : undefined}
      active={active}
      locked={locked}
    >
      {(active || locked) && verdict.status !== 'missing' && (
        <div className="space-y-3">
          {/* What we're evaluating — named explicitly so the merchant
              understands eligibility is being checked against the
              original item value, not the rental fee. */}
          <div className="rounded-xl2 bg-canvas-100/70 ring-1 ring-canvas-200 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {t('merchant.session.eligibility.checkingAgainst')}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <div className="text-[13px] text-ink-900">
                {t('merchant.session.eligibility.originalItemValueLabel')}
              </div>
              <div className="num font-bold text-ink-900 text-[14px]">
                {formatCurrency(originalItemValue)}
              </div>
            </div>
            <div className="text-[10.5px] text-ink-400 leading-relaxed mt-0.5">
              {t('merchant.session.eligibility.checkingAgainstHint')}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <EligibilityFigure
              label={t('merchant.session.eligibility.limit')}
              value={formatCurrency(verdict.limit)}
            />
            <EligibilityFigure
              label={t('merchant.session.eligibility.used')}
              value={formatCurrency(verdict.used)}
            />
            <EligibilityFigure
              label={t('merchant.session.eligibility.remaining')}
              value={formatCurrency(verdict.remaining)}
              emphasize
            />
          </div>

          <div
            className={cn(
              'rounded-xl2 px-4 py-3 ring-1 flex items-center justify-between gap-3',
              verdictTone === 'success' && 'bg-success-50 ring-success-500/20 text-success-700',
              verdictTone === 'danger' && 'bg-danger-50 ring-danger-500/20 text-danger-700',
              verdictTone === 'warn' && 'bg-warn-50 ring-warn-500/20 text-warn-700',
            )}
          >
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-80">
                {verdict.status === 'approved'
                  ? t('merchant.session.eligibility.verdict.approved')
                  : t('merchant.session.eligibility.verdict.insufficient')}
              </div>
              <div className="mt-0.5 text-[12.5px] num">
                {verdict.status === 'approved'
                  ? t('merchant.session.eligibility.detailApproved')
                      .replace('{amount}', formatCurrency(verdict.required))
                  : t('merchant.session.eligibility.detailShort')
                      .replace('{shortBy}', formatCurrency(verdict.shortBy))}
              </div>
            </div>
            {verdict.status === 'approved' ? (
              <BadgeCheckIcon size={18} />
            ) : (
              <ClockIcon size={18} />
            )}
          </div>

          {active && verdict.status === 'approved' && (
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
                {t('merchant.session.eligibility.issuePackageCta')
                  .replace('{amount}', formatCurrency(rentalAmount))}
              </Button>
              <p className="text-center text-[11.5px] text-ink-400 leading-relaxed px-2">
                {t('merchant.session.eligibility.issuePackageHint')}
              </p>
            </>
          )}

          {active && verdict.status === 'insufficient' && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md" onClick={onReduce}>
                {t('merchant.session.eligibility.reduceCta')}
              </Button>
              <Button variant="ghost" size="md" onClick={onCancel}>
                {t('merchant.session.eligibility.cancelCta')}
              </Button>
            </div>
          )}
        </div>
      )}

      {(active || locked) && verdict.status === 'missing' && (
        <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/25 px-3.5 py-2.5 text-[12.5px] text-warn-700">
          {t('merchant.session.eligibility.missing')}
        </div>
      )}
    </StepShell>
  );
}

function EligibilityFigure({
  label,
  value,
  emphasize,
}: {
  label: ReactNode;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl2 px-3 py-2.5 ring-1',
        emphasize
          ? 'bg-lavender-50 ring-lavender-200 text-lavender-700'
          : 'bg-canvas-100 ring-canvas-200 text-ink-700',
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] num font-bold text-ink-900">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Handoff — the in-store session is over; the documented journey begins.
// This card names that transition explicitly.
// ---------------------------------------------------------------------

function HandoffCard({
  t,
  dir,
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
  const token = invoice.scan_token ?? invoice.invoice_number;
  const journey = deriveJourneyFromInvoice(
    {
      issued_at: invoice.issued_at,
      created_at: invoice.created_at,
      status: invoice.status,
    },
    { viewerIsReviewing: false },
  );
  return (
    <>
      <section className="rounded-xl3 bg-white hairline shadow-soft p-6 animate-reveal-up">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-lavender-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-lavender-700 animate-stamp-in">
          <BadgeCheckIcon size={11} />
          {t('merchant.session.handoff.seal')}
        </div>
        <h3 className="mt-4 editorial-title text-[20px] text-ink-900 leading-tight">
          {t('merchant.session.handoff.title')}
        </h3>
        <p className="mt-2 text-[13px] text-ink-500 leading-relaxed">
          {t('merchant.session.handoff.body')}
        </p>

        {/* Three explicit lines of confirmation — what just happened, what
            the customer does next, where the documented journey begins. */}
        <ol className="mt-5 space-y-3">
          <HandoffLine
            number={1}
            label={t('merchant.session.handoff.line1Label')}
            value={t('merchant.session.handoff.line1Value', {
              ref: invoice.invoice_number,
            })}
            tone="documented"
          />
          <HandoffLine
            number={2}
            label={t('merchant.session.handoff.line2Label')}
            value={t('merchant.session.handoff.line2Value', {
              name: renter?.full_name ?? t('merchant.session.handoff.renterFallback'),
            })}
          />
          <HandoffLine
            number={3}
            label={t('merchant.session.handoff.line3Label')}
            value={t('merchant.session.handoff.line3Value')}
          />
        </ol>

        <div className="mt-5 rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {t('merchant.session.handoff.tokenLabel')}
          </div>
          <div className="mt-1.5 font-mono text-[13.5px] text-ink-900 break-all num">
            {token}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              navigator.clipboard?.writeText(token).catch(() => {});
            }}
            leading={<WalletIcon size={14} />}
          >
            {t('merchant.session.handoff.copyCta')}
          </Button>
          <Link
            to={`/review/${token}`}
            className="inline-flex items-center justify-center h-11 px-4 rounded-xl2 bg-white ring-1 ring-inset ring-lavender-200 text-ink-900 text-[14px] font-semibold gap-2 hover:bg-lavender-50"
          >
            {t('merchant.session.handoff.openReviewCta')}
            <ArrowIcon size={14} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
          </Link>
        </div>
      </section>

      <RentalJourneyTimeline variant="lead" steps={journey} />

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => navigate('/merchant/home')}
          className="text-[12.5px] text-ink-500 hover:text-ink-700 underline underline-offset-4 decoration-canvas-300 hover:decoration-ink-500"
        >
          {t('merchant.session.handoff.doneCta')}
        </button>
      </div>
    </>
  );
}

function HandoffLine({
  number,
  label,
  value,
  tone,
}: {
  number: number;
  label: ReactNode;
  value: ReactNode;
  tone?: 'documented';
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'h-7 w-7 shrink-0 rounded-full grid place-items-center text-[11.5px] font-semibold num ring-1',
          tone === 'documented'
            ? 'bg-lavender-400 text-white ring-lavender-200'
            : 'bg-white text-ink-700 ring-canvas-200',
        )}
        aria-hidden
      >
        {tone === 'documented' ? <CheckIcon size={13} strokeWidth={3} /> : number}
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          {label}
        </div>
        <div className="mt-0.5 text-[13px] text-ink-900 leading-relaxed">{value}</div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------
// Demo-mode fallback note: when supabaseConfigured is false, we still
// render a fully clickable flow using fixture data inside the action
// handlers (see handleLookupRenter / handleOperationContinue). This
// preserves the demo-safe behaviour pattern used elsewhere in the app.
// ---------------------------------------------------------------------

void InfoIcon; // keep imports stable when verifyNotFound copy moves around