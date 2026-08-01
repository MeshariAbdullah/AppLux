import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  FormField,
  Input,
  NumericField,
  SaudiMobileField,
  Select,
  Textarea,
} from '@/components/ui';
import { ActivityPicker, type ActivityKey } from '@/components/merchant/ActivityPicker';
import { DocumentUploadField } from '@/components/merchant/DocumentUploadField';
import { translateAuthError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { normalizeDigits } from '@/lib/validation/customer';
import {
  resendSignupConfirmation,
  signUpMerchant,
  useSupabaseAuth,
  verifyEmailOtp,
} from '@/lib/supabase';
import { classifyMerchantSignup } from '@/lib/auth/merchantSignupOutcome';
import { cn } from '@/lib/cn';
import {
  ArrowIcon,
  BuildingIcon,
  CheckIcon,
  DocIcon,
  MapPinIcon,
  PlusIcon,
} from '@/components/icons';

/** HTTPS Google-Maps hosts — mirrors the server CHECK + trigger regex. */
const MAP_URL_RE =
  /^https:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i;
const UNIFIED_RE = /^700\d{7}$/;

// =====================================================================
// Merchant registration — SEPARATE ACCOUNT from the start (merchant
// separation M2). Five steps: credentials → business → representative
// → branches (≥1) → review + consent. ONE auth.signUp call at final
// submission creates the auth account, the merchant/pending profile,
// the application, and the draft branches atomically (DB trigger
// 20260502122800). No customer account, no eligibility, no customer-
// area access. Auth metadata retains only {account_type, full_name} —
// the payload is stripped before the auth row is persisted.
//
// The pre-separation "signed-in customer applies" flow is REMOVED for
// new applications; legacy pending applications remain readable via
// /merchant/pending until the queue drains.
// =====================================================================

const CITY_KEYS = [
  'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'tabuk',
  'abha', 'taif', 'qassim', 'hail', 'najran', 'jazan', 'baha', 'yanbu',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Consent is MANDATORY when (and only when) both production URLs are
// configured. Without them the consent row is absent entirely — never
// optional consent, never placeholder links (approved decision 8).
const TERMS_URL = (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim() || '';
const PRIVACY_URL =
  (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim() || '';
const CONSENT_ENABLED = Boolean(TERMS_URL && PRIVACY_URL);

type BranchDraft = {
  key: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  mapUrl: string;
};

type Wizard = {
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  unifiedNumber: string;
  categories: string[];
  authorizedName: string;
  authorizedId: string;
  contactMobile: string;
  contactEmail: string;
  branches: BranchDraft[];
  docReceipt: string | null;
  docFileName: string;
  consent: boolean;
};

type FieldKey = keyof Omit<
  Wizard,
  'branches' | 'consent' | 'categories' | 'docReceipt' | 'docFileName'
>;
type BranchErrors = Partial<Record<'name' | 'city' | 'address' | 'phone' | 'mapUrl', string>>;
type Errors = Partial<Record<FieldKey, string>> & {
  branches?: Record<string, BranchErrors>;
  categories?: string;
  document?: string;
  consent?: string;
  form?: string;
};

let branchSeq = 0;
function newBranch(): BranchDraft {
  branchSeq += 1;
  return { key: `b${branchSeq}`, name: '', city: '', address: '', phone: '', mapUrl: '' };
}

// 6 steps: credentials → establishment → representative → branches →
// documents → review. Documents (Step 5) uploads the CR copy before the
// merchant can reach Review (Step 6).
const STEPS = [
  { titleKey: 'merchant.register.steps.credentials', subKey: 'merchant.register.steps.credentialsSub' },
  { titleKey: 'merchant.register.steps.company', subKey: 'merchant.register.steps.companySub' },
  { titleKey: 'merchant.register.steps.authorized', subKey: 'merchant.register.steps.authorizedSub' },
  { titleKey: 'merchant.register.steps.branches', subKey: 'merchant.register.steps.branchesSub' },
  { titleKey: 'merchant.register.steps.documents', subKey: 'merchant.register.steps.documentsSub' },
  { titleKey: 'merchant.register.steps.review', subKey: 'merchant.register.steps.reviewSub' },
] as const;
const DOCUMENTS_STEP = 4;
const REVIEW_STEP = 5;

/** Review-screen mask: first 2 + last 2 digits visible only. */
function maskNationalId(id: string): string {
  if (id.length < 5) return '••••••••••';
  return `${id.slice(0, 2)}••••••${id.slice(-2)}`;
}

export default function MerchantRegister() {
  const t = useT();
  const { dir } = useI18n();
  const navigate = useNavigate();
  const { submitMerchantApproval, updateMerchantDraft } = useStore();
  const supabaseAuth = useSupabaseAuth();
  const { configured, status, role, profile } = supabaseAuth;

  const [values, setValues] = useState<Wizard>(() => ({
    email: '', password: '', confirmPassword: '',
    companyName: '', unifiedNumber: '', categories: [],
    authorizedName: '', authorizedId: '', contactMobile: '', contactEmail: '',
    branches: [newBranch()],
    docReceipt: null, docFileName: '',
    consent: false,
  }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Email-confirmation branch: signUp returned a genuinely new/unconfirmed
  // user (identities non-empty) but NO session → GoTrue emailed the 6-digit
  // code and we show the OTP screen (same template + flow as customers).
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const verifyingOtpRef = useRef(false);
  const [resent, setResent] = useState(false);

  const cities = useMemo(
    () => CITY_KEYS.map((c) => ({ key: c, label: t(`register.cities.${c}`) })),
    [t],
  );

  const onField =
    (key: FieldKey) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const patchBranch = (key: string, patch: Partial<BranchDraft>) => {
    setValues((v) => ({
      ...v,
      branches: v.branches.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    }));
    if (errors.branches?.[key]) {
      setErrors((prev) => {
        const next = { ...(prev.branches ?? {}) };
        delete next[key];
        return { ...prev, branches: next };
      });
    }
  };

  const validateStep = (s: number): Errors => {
    const next: Errors = {};
    const req = t('merchant.register.errors.required');
    const v = values;
    if (s === 0) {
      if (!v.email.trim()) next.email = req;
      else if (!EMAIL_RE.test(v.email)) next.email = t('merchant.register.errors.email');
      if (!v.password) next.password = req;
      else if (v.password.length < 6)
        next.password = t('merchant.register.errors.passwordMin');
      if (v.confirmPassword !== v.password)
        next.confirmPassword = t('merchant.register.errors.passwordMismatch');
    }
    if (s === 1) {
      if (!v.companyName.trim()) next.companyName = req;
      if (!UNIFIED_RE.test(normalizeDigits(v.unifiedNumber).trim()))
        next.unifiedNumber = t('merchant.register.errors.unifiedNumber');
      if (v.categories.length < 1)
        next.categories = t('merchant.register.errors.categoryRequired');
    }
    if (s === 2) {
      if (!v.authorizedName.trim()) next.authorizedName = req;
      if (!/^[12]\d{9}$/.test(normalizeDigits(v.authorizedId).trim()))
        next.authorizedId = t('merchant.register.errors.authorizedId');
      if (!/^5\d{8}$/.test(v.contactMobile.trim()))
        next.contactMobile = t('merchant.register.errors.mobile');
      if (v.contactEmail.trim() && !EMAIL_RE.test(v.contactEmail))
        next.contactEmail = t('merchant.register.errors.email');
    }
    if (s === 3) {
      const branchErrs: Record<string, BranchErrors> = {};
      for (const b of v.branches) {
        const be: BranchErrors = {};
        if (!b.name.trim()) be.name = req;
        if (!b.city.trim()) be.city = req;
        if (!b.address.trim()) be.address = req;
        if (b.phone.trim() && !/^5\d{8}$/.test(b.phone.trim()))
          be.phone = t('merchant.register.errors.mobile');
        if (!MAP_URL_RE.test(b.mapUrl.trim()))
          be.mapUrl = t('merchant.register.errors.mapUrl');
        if (Object.keys(be).length) branchErrs[b.key] = be;
      }
      if (Object.keys(branchErrs).length) next.branches = branchErrs;
    }
    // Live mode requires the CR copy to be uploaded (server-confirmed)
    // before Review. Demo mode has no backend to upload to, so it is not
    // gated here.
    if (s === DOCUMENTS_STEP && configured && !v.docReceipt) {
      next.document = t('merchant.register.documents.required');
    }
    if (s === REVIEW_STEP && CONSENT_ENABLED && !v.consent) {
      next.consent = t('merchant.register.consent.required');
    }
    return next;
  };

  const stepHasErrors = (e: Errors) =>
    Object.values(e).some((x) =>
      typeof x === 'string' ? true : x && Object.keys(x).length > 0,
    );

  const submitLive = async () => {
    setSubmitting(true);
    setErrors((prev) => ({ ...prev, form: undefined }));
    try {
      const result = await signUpMerchant({
        email: values.email.trim(),
        password: values.password,
        application: {
          companyName: values.companyName.trim(),
          unifiedNumber: normalizeDigits(values.unifiedNumber).trim(),
          authorizedName: values.authorizedName.trim(),
          authorizedNationalId: normalizeDigits(values.authorizedId).trim(),
          categories: values.categories,
          contactMobile: values.contactMobile.trim(),
          contactEmail: values.contactEmail.trim() || undefined,
          branches: values.branches.map((b) => ({
            name: b.name.trim(),
            city: b.city.trim(),
            address: b.address.trim(),
            phone: b.phone.trim() || null,
            mapUrl: b.mapUrl.trim(),
          })),
          docReceipt: values.docReceipt ?? '',
        },
      });
      // NEVER claim a code was sent without proof. Mirror the customer
      // logic: session → done; identities non-empty → real code emailed →
      // OTP screen; otherwise the address is an already-CONFIRMED account
      // (Supabase obfuscated the signup, no email sent) → friendly error.
      const outcome = classifyMerchantSignup(result);
      if (outcome === 'active') {
        setSubmitted(true);
        navigate('/merchant/pending', { replace: true });
      } else if (outcome === 'confirm') {
        // The application + branches + document claim were created
        // atomically at signUp (trigger runs on the auth insert, before
        // confirmation); the OTP only confirms the email.
        setSubmitted(true);
        setAwaitingConfirmation(true);
        setSubmitting(false);
      } else {
        // Obfuscated duplicate — no auth row created, no email dispatched.
        logEvent('auth_failure', 'warn', { op: 'merchant_sign_up_exists' });
        setErrors({ form: t('merchant.register.errors.emailExists') });
        setSubmitting(false);
      }
    } catch (err) {
      const eMsg =
        err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
          ? ((err as { message: string }).message ?? '').toLowerCase()
          : '';
      logEvent('auth_failure', 'warn', { op: 'merchant_sign_up' }, err);
      // GoTrue flattens trigger failures into one opaque message. For
      // MERCHANT signup the realistic in-trigger failure is a pending
      // application with the same CR (client pre-validation covers the
      // rest) — map it to actionable copy instead of the customer
      // duplicate-mobile heuristic.
      setErrors({
        form: eMsg.includes('database error saving new user')
          ? t('merchant.register.errors.signupDbFailed')
          : translateAuthError(err, t),
      });
      setSubmitting(false);
    }
  };

  const submitDemo = () => {
    // Demo store parity: feed the demo pipeline so MerchantPending's
    // demo view renders; no auth involved.
    updateMerchantDraft({
      companyName: values.companyName,
      commercialReg: normalizeDigits(values.unifiedNumber),
      authorizedName: values.authorizedName,
      authorizedId: values.authorizedId,
      iban: '',
      city: values.branches[0]?.city ?? '',
      address: values.branches[0]?.address ?? '',
      contactEmail: values.contactEmail || values.email,
      contactPhone: values.contactMobile,
      branches: values.branches.map((b, i) => ({
        id: `BR-${i + 1}`,
        name: b.name,
        city: b.city,
        address: b.address,
        phone: b.phone,
      })),
    });
    submitMerchantApproval();
    navigate('/merchant/pending', { replace: true });
  };

  const goNext = async () => {
    const e = validateStep(step);
    if (stepHasErrors(e)) {
      setErrors(e);
      return;
    }
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    if (submitting || submitted) return; // double-submit guard
    if (configured) await submitLive();
    else submitDemo();
  };

  const goBack = () => {
    if (step === 0) {
      navigate(-1);
      return;
    }
    setStep((s) => s - 1);
  };

  // ---- signed-in interstitial (live mode) ----
  // A merchant account is created from a SIGNED-OUT state. Active
  // merchants go to their dashboard, pending ones to their status
  // page; anyone else must sign out first (approved: never reuse a
  // customer session for merchant onboarding).
  if (configured && status === 'authenticated') {
    if (role === 'merchant') {
      return (
        <Navigate
          to={profile?.account_status === 'active' ? '/merchant/home' : '/merchant/pending'}
          replace
        />
      );
    }
    return (
      <>
        <Header title={t('merchant.register.title')} showBack />
        <Screen className="bg-canvas">
          <Card padded className="text-center space-y-3">
            <div className="mx-auto h-11 w-11 rounded-xl bg-warn-50 text-warn-600 grid place-items-center ring-1 ring-warn-500/25">
              <BuildingIcon size={20} />
            </div>
            <div className="text-[15px] font-semibold text-ink-900">
              {t('merchant.register.signedIn.title')}
            </div>
            <p className="text-[12.5px] text-ink-500 leading-relaxed">
              {t('merchant.register.signedIn.body')}
            </p>
            <Button
              variant="primary"
              block
              onClick={() => {
                void supabaseAuth.signOut();
              }}
            >
              {t('merchant.register.signedIn.cta')}
            </Button>
          </Card>
        </Screen>
      </>
    );
  }

  // ---- email OTP-confirmation panel ----
  // The project's confirmation template renders {{ .Token }} (a 6-digit
  // code) — same as the customer flow — so the merchant enters the code
  // here. verifyEmailOtp yields a session → onAuthStateChange → the
  // authenticated guard above redirects to /merchant/pending.
  const verifyOtp = async () => {
    if (verifyingOtpRef.current) return;
    const token = normalizeDigits(otpCode.trim());
    if (!/^\d{6}$/.test(token)) {
      setOtpError(t('auth.verifyEmail.codeFormat'));
      return;
    }
    verifyingOtpRef.current = true;
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await verifyEmailOtp({ email: values.email.trim(), token });
      // Session propagates via onAuthStateChange; the guard navigates.
    } catch (err) {
      logEvent('auth_failure', 'warn', { op: 'merchant_verify_email_otp' }, err);
      setOtpError(translateAuthError(err, t));
      setVerifyingOtp(false);
      verifyingOtpRef.current = false;
    }
  };

  if (awaitingConfirmation) {
    return (
      <>
        <Header title={t('merchant.register.title')} />
        <Screen className="bg-canvas">
          <Card padded className="space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto h-11 w-11 rounded-xl bg-lavender-50 text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
                <CheckIcon size={20} />
              </div>
              <div className="text-[15px] font-semibold text-ink-900">
                {t('merchant.register.emailConfirm.title')}
              </div>
              <p className="text-[12.5px] text-ink-500 leading-relaxed">
                {t('merchant.register.emailConfirm.body')}{' '}
                <span className="font-semibold text-ink-800 break-all" dir="ltr">
                  {values.email.trim()}
                </span>
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verifyOtp();
              }}
              noValidate
              className="space-y-3"
            >
              <FormField label={t('auth.verifyEmail.codeLabel')} error={otpError ?? undefined}>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  dir="ltr"
                  className="num text-center tracking-[0.4em] text-[18px]"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(normalizeDigits(e.target.value).replace(/\D/g, ''));
                    if (otpError) setOtpError(null);
                  }}
                  invalid={Boolean(otpError)}
                />
              </FormField>
              <Button
                type="submit"
                block
                loading={verifyingOtp}
                disabled={verifyingOtp || otpCode.length < 6}
                className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
              >
                {t('auth.verifyEmail.verifyCta')}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => {
                resendSignupConfirmation(values.email.trim())
                  .then(() => {
                    setResent(true);
                    window.setTimeout(() => setResent(false), 3000);
                  })
                  .catch((err) => {
                    logEvent('auth_failure', 'warn', { op: 'merchant_resend_email_otp' }, err);
                  });
              }}
              className="w-full text-[13px] font-bold text-green-700 hover:text-green-800"
            >
              {resent
                ? t('merchant.register.emailConfirm.resent')
                : t('auth.verifyEmail.resendCta')}
            </button>
            <Link
              to="/merchant/login"
              className="block text-center text-[12.5px] text-ink-400 hover:text-ink-600"
            >
              {t('merchant.register.emailConfirm.toLogin')}
            </Link>
          </Card>
        </Screen>
      </>
    );
  }

  const current = STEPS[step];

  return (
    <>
      {/* M02–M06 header: back square, title, LTR step counter, then the
          five-segment progress bar (done = deep green, current = vibrant
          green, upcoming = neutral). */}
      <div className="bg-beige-100 px-5 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="h-9 w-9 grid place-items-center rounded-[10px] bg-white text-navy-700 shadow-soft"
            aria-label={t('common.back')}
          >
            <ArrowIcon size={16} className={cn(dir === 'rtl' ? '' : 'rotate-180')} />
          </button>
          <h1 className="flex-1 text-[16px] font-bold text-navy-700">
            {t('merchant.register.title')}
          </h1>
          <span className="text-[12px] text-ink-500 num" dir="ltr">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div
          className="mt-3.5 flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={t('merchant.register.progress', { current: step + 1, total: STEPS.length })}
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i < step ? 'bg-green-700' : i === step ? 'bg-green-500' : 'bg-navy-100/60',
              )}
            />
          ))}
        </div>
      </div>

      <Screen padded={false} className="bg-beige-100">
        <div className="px-5 pt-5 pb-6 flex flex-col min-h-full">
          <div>
            <h1 className="text-[18px] font-bold text-navy-700">{t(current.titleKey)}</h1>
            <p className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">{t(current.subKey)}</p>
          </div>

          <form
            className="mt-5 flex-1 flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void goNext();
            }}
            noValidate
          >
            <div className="space-y-4">
          {step === 0 && (
            <>
              <FormField label={t('merchant.register.email')} required error={errors.email}>
                <Input
                  type="email"
                  placeholder={t('merchant.register.emailPh')}
                  value={values.email}
                  onChange={onField('email')}
                  invalid={Boolean(errors.email)}
                  autoComplete="email"
                />
              </FormField>
              <FormField label={t('merchant.register.password')} required error={errors.password}>
                <Input
                  type="password"
                  value={values.password}
                  onChange={onField('password')}
                  invalid={Boolean(errors.password)}
                  autoComplete="new-password"
                />
              </FormField>
              <FormField
                label={t('merchant.register.confirmPassword')}
                required
                error={errors.confirmPassword}
              >
                <Input
                  type="password"
                  value={values.confirmPassword}
                  onChange={onField('confirmPassword')}
                  invalid={Boolean(errors.confirmPassword)}
                  autoComplete="new-password"
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormField label={t('merchant.register.companyName')} required error={errors.companyName}>
                <Input
                  placeholder={t('merchant.register.companyNamePh')}
                  value={values.companyName}
                  onChange={onField('companyName')}
                  invalid={Boolean(errors.companyName)}
                  leading={<BuildingIcon size={16} />}
                />
              </FormField>
              <FormField
                label={t('merchant.register.unifiedNumber')}
                required
                error={errors.unifiedNumber}
                hint={!errors.unifiedNumber ? t('merchant.register.unifiedNumberHint') : undefined}
              >
                <NumericField
                  maxDigits={10}
                  placeholder="700XXXXXXX"
                  value={values.unifiedNumber}
                  onValueChange={(next) => {
                    setValues((v) => ({ ...v, unifiedNumber: next }));
                    if (errors.unifiedNumber) setErrors((p) => ({ ...p, unifiedNumber: undefined }));
                  }}
                  invalid={Boolean(errors.unifiedNumber)}
                />
              </FormField>
              {/* Multi-select store activities (≥1). */}
              <div className="space-y-2">
                <div className="text-[13px] font-semibold text-ink-800">
                  {t('merchant.register.activities.title')}
                  <span className="ms-1 text-danger-500">*</span>
                </div>
                <p className="text-[12px] text-ink-400 leading-snug">
                  {t('merchant.register.activities.helper')}
                </p>
                <ActivityPicker
                  selected={values.categories}
                  invalid={Boolean(errors.categories)}
                  onToggle={(key: ActivityKey) => {
                    setValues((v) => ({
                      ...v,
                      categories: v.categories.includes(key)
                        ? v.categories.filter((c) => c !== key)
                        : [...v.categories, key],
                    }));
                    if (errors.categories) setErrors((p) => ({ ...p, categories: undefined }));
                  }}
                />
                {errors.categories && (
                  <div className="text-[12px] text-danger-600">{errors.categories}</div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <FormField label={t('merchant.register.authorizedName')} required error={errors.authorizedName}>
                <Input
                  placeholder={t('merchant.register.authorizedNamePh')}
                  value={values.authorizedName}
                  onChange={onField('authorizedName')}
                  invalid={Boolean(errors.authorizedName)}
                  autoComplete="name"
                />
              </FormField>
              <FormField label={t('merchant.register.authorizedId')} required error={errors.authorizedId}>
                <NumericField
                  maxDigits={10}
                  placeholder={t('merchant.register.authorizedIdPh')}
                  value={values.authorizedId}
                  onValueChange={(next) => {
                    setValues((v) => ({ ...v, authorizedId: next }));
                    if (errors.authorizedId) setErrors((p) => ({ ...p, authorizedId: undefined }));
                  }}
                  invalid={Boolean(errors.authorizedId)}
                />
              </FormField>
              <FormField label={t('merchant.register.contactPhone')} required error={errors.contactMobile}>
                <SaudiMobileField
                  value={values.contactMobile}
                  onValueChange={(next) => {
                    setValues((v) => ({ ...v, contactMobile: next }));
                    if (errors.contactMobile) setErrors((p) => ({ ...p, contactMobile: undefined }));
                  }}
                  invalid={Boolean(errors.contactMobile)}
                />
              </FormField>
              <FormField
                label={t('merchant.register.contactEmail')}
                error={errors.contactEmail}
                hint={!errors.contactEmail ? t('merchant.register.contactEmailHint') : undefined}
              >
                <Input
                  type="email"
                  placeholder={values.email || t('merchant.register.contactEmailPh')}
                  value={values.contactEmail}
                  onChange={onField('contactEmail')}
                  invalid={Boolean(errors.contactEmail)}
                  autoComplete="email"
                />
              </FormField>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-4">
                {values.branches.map((b, idx) => {
                  const be: BranchErrors = errors.branches?.[b.key] ?? {};
                  return (
                    <Card key={b.key} padded className="space-y-3 rounded-[14px]">
                      {/* M05 branch-card header: green location badge +
                          branch label + red remove action. */}
                      <div className="flex items-center gap-3">
                        <span className="h-9 w-9 shrink-0 rounded-[10px] bg-green-50 text-green-700 grid place-items-center">
                          <MapPinIcon size={15} />
                        </span>
                        <div className="flex-1 text-[13.5px] font-bold text-navy-700 truncate">
                          {b.name.trim() ||
                            t('merchant.register.branchTitle', { index: idx + 1 })}
                        </div>
                        {values.branches.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setValues((v) => ({
                                ...v,
                                branches: v.branches.filter((x) => x.key !== b.key),
                              }))
                            }
                            className="text-[12.5px] font-bold text-danger-600 hover:underline"
                          >
                            {t('merchant.register.removeBranch')}
                          </button>
                        )}
                      </div>
                      <FormField label={t('merchant.register.branchName')} required error={be.name}>
                        <Input
                          placeholder={t('merchant.register.branchNamePh')}
                          value={b.name}
                          onChange={(e) => patchBranch(b.key, { name: e.target.value })}
                          invalid={Boolean(be.name)}
                        />
                      </FormField>
                      <FormField label={t('merchant.register.branchCity')} required error={be.city}>
                        <Select
                          value={b.city}
                          onChange={(e) => patchBranch(b.key, { city: e.target.value })}
                          invalid={Boolean(be.city)}
                        >
                          <option value="" disabled>
                            {t('merchant.register.cityPh')}
                          </option>
                          {cities.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label={t('merchant.register.branchAddress')} required error={be.address}>
                        <Textarea
                          rows={2}
                          placeholder={t('merchant.register.addressPh')}
                          value={b.address}
                          onChange={(e) => patchBranch(b.key, { address: e.target.value })}
                          invalid={Boolean(be.address)}
                        />
                      </FormField>
                      <FormField label={t('merchant.register.branchPhone')} error={be.phone}>
                        <SaudiMobileField
                          value={b.phone}
                          onValueChange={(next) => patchBranch(b.key, { phone: next })}
                          invalid={Boolean(be.phone)}
                        />
                      </FormField>
                      <FormField
                        label={t('merchant.register.branchMapUrl')}
                        required
                        error={be.mapUrl}
                        hint={!be.mapUrl ? t('merchant.register.branchMapUrlHint') : undefined}
                      >
                        <Input
                          type="url"
                          dir="ltr"
                          inputMode="url"
                          placeholder={t('merchant.register.branchMapUrlPh')}
                          value={b.mapUrl}
                          onChange={(e) => patchBranch(b.key, { mapUrl: e.target.value })}
                          invalid={Boolean(be.mapUrl)}
                          leading={<MapPinIcon size={15} />}
                          className="text-left"
                        />
                      </FormField>
                    </Card>
                  );
                })}
              </div>
              {/* M05 add action — green-tint pill on a dashed frame. */}
              <button
                type="button"
                onClick={() => setValues((v) => ({ ...v, branches: [...v.branches, newBranch()] }))}
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 h-12 rounded-xl2',
                  'bg-green-50 text-green-700 font-bold text-[13.5px]',
                  'border-[1.5px] border-dashed border-green-200 hover:bg-green-100 transition-colors',
                )}
              >
                <PlusIcon size={15} />
                {t('merchant.register.addBranch')}
              </button>
            </>
          )}

          {step === DOCUMENTS_STEP && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-lavender-50 text-lavender-700">
                  <DocIcon size={16} />
                </span>
                <div className="text-[13.5px] font-semibold text-ink-800">
                  {t('merchant.register.documents.crTitle')}
                </div>
              </div>
              <DocumentUploadField
                receipt={values.docReceipt}
                invalid={Boolean(errors.document)}
                onReceiptChange={(next) => {
                  setValues((v) => ({
                    ...v,
                    docReceipt: next?.receipt ?? null,
                    docFileName: next?.fileName ?? '',
                  }));
                  if (errors.document) setErrors((p) => ({ ...p, document: undefined }));
                }}
              />
              {errors.document && (
                <div className="text-[12px] text-danger-600">{errors.document}</div>
              )}
            </div>
          )}

          {step === REVIEW_STEP && (
            <div className="space-y-3">
              {/* M06 — ONE compact card of label/value rows so the whole
                  review + consent + footer fit a phone screen. */}
              <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-1.5">
                <ReviewRow label={t('merchant.register.email')} value={values.email} ltr />
                <ReviewRow label={t('merchant.register.companyName')} value={values.companyName} />
                <ReviewRow label={t('merchant.register.unifiedNumber')} value={normalizeDigits(values.unifiedNumber)} ltr />
                <ReviewRow
                  label={t('merchant.register.review.activitiesLabel')}
                  value={
                    values.categories.length
                      ? values.categories.map((c) => t(`merchant.register.categories.${c}`)).join('، ')
                      : '—'
                  }
                />
                <ReviewRow label={t('merchant.register.authorizedName')} value={values.authorizedName} />
                {/* Masked on review — the full id travels only inside the
                    signup payload. */}
                <ReviewRow
                  label={t('merchant.register.authorizedId')}
                  value={maskNationalId(normalizeDigits(values.authorizedId).trim())}
                  ltr
                />
                <ReviewRow label={t('merchant.register.contactPhone')} value={`+966 ${values.contactMobile}`} ltr />
                {values.branches.map((b, i) => (
                  <ReviewRow
                    key={b.key}
                    label={t('merchant.register.branchTitle', { index: i + 1 })}
                    value={`${b.name} — ${t(`register.cities.${b.city}`)}`}
                  />
                ))}
                <ReviewRow
                  label={t('merchant.register.documents.crTitle')}
                  value={values.docReceipt ? t('merchant.register.documents.uploaded') : '—'}
                  last
                />
              </div>

              {CONSENT_ENABLED && (
                <label className="flex items-start gap-3 rounded-xl2 bg-white hairline p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values.consent}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, consent: e.target.checked }));
                      if (errors.consent) setErrors((p) => ({ ...p, consent: undefined }));
                    }}
                    className="mt-0.5 h-4 w-4 accent-ink-900"
                  />
                  <span className="text-[12.5px] text-ink-700 leading-relaxed">
                    {t('merchant.register.consent.agreePrefix')}{' '}
                    <a
                      href={TERMS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-lavender-700 underline underline-offset-4"
                    >
                      {t('merchant.register.consent.terms')}
                    </a>
                    {` ${t('merchant.register.consent.and')} `}
                    <a
                      href={PRIVACY_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-lavender-700 underline underline-offset-4"
                    >
                      {t('merchant.register.consent.privacy')}
                    </a>
                  </span>
                </label>
              )}
              {errors.consent && (
                <div className="text-[12px] text-danger-600">{errors.consent}</div>
              )}
            </div>
          )}

            {errors.form && (
              <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
                {errors.form}
              </div>
            )}
            </div>

            {/* M02–M06 footer, pinned to the screen bottom: step 1 has a
                single full-width NAVY CTA (the header back square covers
                "previous"); steps 2–5 pair the navy CTA with the
                outlined السابق. The wizard never shows the tab bar so
                nothing can overlap. */}
            <div className="mt-auto pt-6 pb-[env(safe-area-inset-bottom)]">
              <div className="flex gap-2.5">
                <Button
                  type="submit"
                  size="lg"
                  loading={submitting}
                  className={cn(
                    '!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800',
                    step === 0 ? 'flex-1' : 'flex-[2]',
                  )}
                >
                  {step === STEPS.length - 1
                    ? t('merchant.register.submit')
                    : t(`merchant.register.next.${step}`)}
                </Button>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={goBack}
                    className={cn(
                      'flex-1 h-13 rounded-xl2 bg-white text-navy-700 font-bold text-[14px]',
                      'ring-[1.5px] ring-inset ring-beige-300 hover:bg-beige-50 transition-colors',
                    )}
                  >
                    {t('merchant.register.prev')}
                  </button>
                )}
              </div>
              {step === 0 && (
                <div className="pt-3 text-center text-[13px] text-ink-500">
                  {t('auth.haveAccount')}{' '}
                  <Link to="/merchant/login" className="font-bold text-navy-700 hover:text-green-700">
                    {t('merchant.entry.login')}
                  </Link>
                </div>
              )}
            </div>
          </form>
        </div>
      </Screen>
    </>
  );
}

/** M06 compact row — muted label at the start, bold value at the end. */
function ReviewRow({
  label,
  value,
  ltr,
  last,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-2.5',
        !last && 'border-b border-beige-100',
      )}
    >
      <span className="text-[12.5px] text-ink-500 shrink-0">{label}</span>
      <span
        className="text-[13px] font-bold text-ink-900 text-end truncate"
        dir={ltr ? 'ltr' : undefined}
      >
        {value || '—'}
      </span>
    </div>
  );
}
