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
  fetchProfileByMobile,
  useSupabaseAuth,
  type ProfileRow,
  type RentalCategoryDB,
  type RentalEligibilityRow,
  type RentalInvoiceRow,
} from '@/lib/supabase';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { deriveJourneyFromInvoice } from '@/lib/rentalJourney';
import { cn } from '@/lib/cn';

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
  securityDeposit: string;
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
    securityDeposit: '',
  },
  eligibility: { row: null, loading: false, error: null },
  issue: { invoice: null, submitting: false, error: null },
};

const CATEGORIES: RentalCategoryDB[] = ['dress', 'bag', 'watch', 'bisht'];
const STEPS: SessionStep[] = ['start', 'verify', 'operation', 'eligibility', 'issued'];

// ---------------------------------------------------------------------
// Placeholder OTP — swap these two functions for real SMS provider
// calls later (Twilio / Unifonic / Vonage). The session state machine
// above does not change.
// ---------------------------------------------------------------------

async function sendRenterCode(_mobile: string): Promise<void> {
  await new Promise((r) => window.setTimeout(r, 350));
}

async function verifyRenterCode(_mobile: string, _code: string): Promise<boolean> {
  // For staging any 4+ digit code passes.
  await new Promise((r) => window.setTimeout(r, 350));
  return true;
}

// ---------------------------------------------------------------------

function macroVerificationState(s: VerificationStatus): MacroVerification {
  if (s === 'verified') return 'verified';
  if (s === 'not_found') return 'not_found';
  if (s === 'found' || s === 'otp_sent' || s === 'looking_up') return 'pending';
  return 'idle';
}

function maskMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return raw;
  return `•••${digits.slice(-4)}`;
}

function computeOperationAmount(draft: OperationDraft): number {
  const rate = Number(draft.dailyRate) || 0;
  const days = Math.max(Number(draft.rentalDays) || 1, 1);
  const deposit = Number(draft.securityDeposit) || 0;
  return rate * days + deposit;
}

function deriveVerdict(
  renterEligibility: RentalEligibilityRow | null,
  operationAmount: number,
): EligibilityVerdict {
  if (!renterEligibility) return { status: 'missing' };
  const limit = Number(renterEligibility.limit_amount);
  const used = Number(renterEligibility.used_amount);
  const remaining = Math.max(limit - used, 0);
  const required = Math.max(operationAmount, 0);
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

  const operationAmount = useMemo(
    () => computeOperationAmount(session.operation),
    [session.operation],
  );
  const verdict = useMemo(
    () => deriveVerdict(session.eligibility.row, operationAmount),
    [session.eligibility.row, operationAmount],
  );
  const macroVerify = macroVerificationState(session.verify.status);

  // ---------------- Step actions ----------------

  const handleStart = () => setStep('verify');

  const handleLookupRenter = async () => {
    updateVerify({ error: null });
    const digits = session.verify.mobile.replace(/\D/g, '');
    if (!/^5\d{8}$/.test(digits)) {
      updateVerify({ error: t('merchant.session.verify.errors.mobileFormat') });
      return;
    }
    if (!supabaseAuth.configured) {
      // Demo-safe path: simulate a found renter so the flow stays clickable
      // even without a backend.
      updateVerify({
        status: 'found',
        renter: {
          id: 'demo-renter',
          full_name: 'Demo Renter',
          mobile: digits,
          email: 'demo.renter@applux.test',
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
    updateVerify({ status: 'looking_up' });
    try {
      const profile = await fetchProfileByMobile(digits);
      if (!profile) {
        updateVerify({ status: 'not_found', renter: null });
        return;
      }
      updateVerify({ status: 'found', renter: profile });
    } catch (err) {
      updateVerify({
        status: 'unverified',
        error: err instanceof Error ? err.message : 'Lookup failed.',
      });
    }
  };

  const handleSendCode = async () => {
    if (!session.verify.renter) return;
    updateVerify({ error: null });
    await sendRenterCode(session.verify.renter.mobile ?? session.verify.mobile);
    updateVerify({ status: 'otp_sent' });
  };

  const handleConfirmCode = async () => {
    const trimmed = session.verify.otp.replace(/\D/g, '');
    if (trimmed.length < 4) {
      updateVerify({ error: t('merchant.session.verify.errors.codeShort') });
      return;
    }
    const ok = await verifyRenterCode(session.verify.mobile, trimmed);
    if (!ok) {
      updateVerify({ error: t('merchant.session.verify.errors.codeFailed') });
      return;
    }
    updateVerify({ status: 'verified', error: null });
    setStep('operation');
  };

  const handleOperationContinue = async () => {
    const op = session.operation;
    if (!op.itemName.trim()) return;
    if (Number(op.dailyRate) <= 0) return;
    if (Number(op.rentalDays) < 1) return;

    if (!supabaseAuth.configured || !session.verify.renter) {
      // Demo-safe verdict fixture so the flow stays clickable.
      updateEligibility({
        row: {
          user_id: session.verify.renter?.id ?? 'demo-renter',
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
    if (verdict.status !== 'approved' || !session.verify.renter || !merchantId) return;
    updateIssue({ submitting: true, error: null });
    try {
      const result = await createInvoiceWithItems({
        merchantId,
        customerUserId: session.verify.renter.id,
        subtotalAmount: operationAmount - (Number(session.operation.securityDeposit) || 0),
        totalAmount: operationAmount - (Number(session.operation.securityDeposit) || 0),
        securityDeposit: Number(session.operation.securityDeposit) || 0,
        items: [
          {
            position: 0,
            item_name: session.operation.itemName.trim(),
            category: session.operation.category,
            size_label: null,
            color: null,
            daily_rate: Number(session.operation.dailyRate) || 0,
            rental_days: Math.max(Number(session.operation.rentalDays) || 1, 1),
            subtotal:
              (Number(session.operation.dailyRate) || 0) *
              Math.max(Number(session.operation.rentalDays) || 1, 1),
            replacement_value: null,
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
              operationAmount={operationAmount}
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
              operationAmount={operationAmount}
              formatCurrency={formatCurrency}
              issuing={session.issue.submitting}
              issueError={session.issue.error}
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
                hint={t('merchant.session.verify.mobileHint')}
              >
                <Input
                  inputMode="tel"
                  placeholder="5XXXXXXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  leading={<PhoneIcon size={14} className="text-ink-400" />}
                  maxLength={12}
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
                onClick={onLookup}
                loading={status === 'looking_up'}
              >
                {t('merchant.session.verify.lookupCta')}
              </Button>
            </>
          )}

          {/* Pending — renter exists, verification in progress */}
          {(status === 'found' || status === 'otp_sent') && renter && (
            <>
              <VerificationBanner macro="pending" t={t}>
                <RenterSummary renter={renter} t={t} />
              </VerificationBanner>
              {status === 'found' && (
                <Button variant="primary" size="lg" block onClick={onSendCode}>
                  {t('merchant.session.verify.sendCodeCta', { mask: maskMobile(mobile) })}
                </Button>
              )}
              {status === 'otp_sent' && (
                <>
                  <FormField
                    label={t('merchant.session.verify.codeLabel')}
                    hint={t('merchant.session.verify.codeHint', { mask: maskMobile(mobile) })}
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
  operationAmount,
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
  operationAmount: number;
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
              {formatCurrency(operationAmount)}
            </span>
          </div>
          <div className="text-[11.5px] text-ink-400 num">
            {t('merchant.session.operation.summary')
              .replace('{days}', String(Math.max(Number(operation.rentalDays) || 1, 1)))
              .replace('{rate}', formatCurrency(Number(operation.dailyRate) || 0))}
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
            <FormField label={t('merchant.session.operation.depositLabel')}>
              <Input
                inputMode="decimal"
                value={operation.securityDeposit}
                onChange={(e) => setOperation({ securityDeposit: e.target.value })}
                className="num"
                trailing={
                  <span className="text-ink-400 text-[12px] font-medium">
                    {t('common.sar')}
                  </span>
                }
              />
            </FormField>
          </div>

          <div className="rounded-xl2 bg-lavender-50/60 ring-1 ring-lavender-200/60 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-lavender-700">
                {t('merchant.session.operation.amountLabel')}
              </div>
              <div className="mt-0.5 editorial-title text-[20px] num text-ink-900 leading-none">
                {formatCurrency(operationAmount)}
              </div>
            </div>
            <ReceiptIcon size={18} className="text-lavender-600 shrink-0" />
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
              !(Number(operation.rentalDays) >= 1)
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
  operationAmount,
  formatCurrency,
  issuing,
  issueError,
  active,
  locked,
  onIssue,
  onReduce,
  onCancel,
}: {
  t: (k: string) => string;
  verdict: EligibilityVerdict;
  operationAmount: number;
  formatCurrency: (n: number) => string;
  issuing: boolean;
  issueError: string | null;
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
                leading={<DocIcon size={16} />}
              >
                {t('merchant.session.eligibility.issuePackageCta')
                  .replace('{amount}', formatCurrency(operationAmount))}
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