import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { translateAuthError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  resendSignupConfirmation,
  signUpMerchant,
  useSupabaseAuth,
} from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { ArrowIcon, BuildingIcon, CheckIcon, PlusIcon } from '@/components/icons';

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

const CATEGORY_KEYS = ['dress', 'bag', 'watch', 'bisht'] as const;

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
};

type Wizard = {
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  commercialReg: string;
  category: string;
  authorizedName: string;
  authorizedId: string;
  contactMobile: string;
  contactEmail: string;
  branches: BranchDraft[];
  consent: boolean;
};

type FieldKey = keyof Omit<Wizard, 'branches' | 'consent'>;
type BranchErrors = Partial<Record<'name' | 'city' | 'address' | 'phone', string>>;
type Errors = Partial<Record<FieldKey, string>> & {
  branches?: Record<string, BranchErrors>;
  consent?: string;
  form?: string;
};

let branchSeq = 0;
function newBranch(): BranchDraft {
  branchSeq += 1;
  return { key: `b${branchSeq}`, name: '', city: '', address: '', phone: '' };
}

const STEPS = [
  { titleKey: 'merchant.register.steps.credentials', subKey: 'merchant.register.steps.credentialsSub' },
  { titleKey: 'merchant.register.steps.company', subKey: 'merchant.register.steps.companySub' },
  { titleKey: 'merchant.register.steps.authorized', subKey: 'merchant.register.steps.authorizedSub' },
  { titleKey: 'merchant.register.steps.branches', subKey: 'merchant.register.steps.branchesSub' },
  { titleKey: 'merchant.register.steps.review', subKey: 'merchant.register.steps.reviewSub' },
] as const;

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
    companyName: '', commercialReg: '', category: '',
    authorizedName: '', authorizedId: '', contactMobile: '', contactEmail: '',
    branches: [newBranch()],
    consent: false,
  }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Email-confirmation branch: signUp returned a user but NO session.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
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
      if (!/^\d{10}$/.test(v.commercialReg.trim()))
        next.commercialReg = t('merchant.register.errors.commercialReg');
      if (!CATEGORY_KEYS.includes(v.category as (typeof CATEGORY_KEYS)[number]))
        next.category = t('merchant.register.errors.categoryRequired');
    }
    if (s === 2) {
      if (!v.authorizedName.trim()) next.authorizedName = req;
      if (!/^[12]\d{9}$/.test(v.authorizedId.trim()))
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
        if (Object.keys(be).length) branchErrs[b.key] = be;
      }
      if (Object.keys(branchErrs).length) next.branches = branchErrs;
    }
    if (s === 4 && CONSENT_ENABLED && !v.consent) {
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
          commercialReg: values.commercialReg.trim(),
          authorizedName: values.authorizedName.trim(),
          authorizedNationalId: values.authorizedId.trim(),
          category: values.category,
          contactMobile: values.contactMobile.trim(),
          contactEmail: values.contactEmail.trim() || undefined,
          branches: values.branches.map((b) => ({
            name: b.name.trim(),
            city: b.city.trim(),
            address: b.address.trim(),
            phone: b.phone.trim() || null,
          })),
        },
      });
      setSubmitted(true);
      if (result.session?.user) {
        // Immediate session — provider hydrates the merchant/pending
        // profile; land on the application-status page.
        navigate('/merchant/pending', { replace: true });
      } else {
        // Email confirmation required — the account + application
        // already exist; show the check-email panel.
        setAwaitingConfirmation(true);
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
      commercialReg: values.commercialReg,
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

  // ---- email-confirmation panel ----
  if (awaitingConfirmation) {
    return (
      <>
        <Header title={t('merchant.register.title')} />
        <Screen className="bg-canvas">
          <Card padded className="text-center space-y-3">
            <div className="mx-auto h-11 w-11 rounded-xl bg-lavender-50 text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
              <CheckIcon size={20} />
            </div>
            <div className="text-[15px] font-semibold text-ink-900">
              {t('merchant.register.emailConfirm.title')}
            </div>
            <p className="text-[12.5px] text-ink-500 leading-relaxed">
              {t('merchant.register.emailConfirm.body', { email: values.email.trim() })}
            </p>
            <Button
              variant="secondary"
              block
              onClick={() => {
                resendSignupConfirmation(values.email.trim())
                  .then(() => {
                    setResent(true);
                    window.setTimeout(() => setResent(false), 3000);
                  })
                  .catch((err) => {
                    logEvent('auth_failure', 'warn', { op: 'resend_confirmation' }, err);
                  });
              }}
            >
              {resent
                ? t('merchant.register.emailConfirm.resent')
                : t('merchant.register.emailConfirm.resend')}
            </Button>
            <Link
              to="/merchant/login"
              className="block text-[13px] font-semibold text-gold-700"
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
      <Header
        title={t('merchant.register.title')}
        subtitle={t('merchant.register.step', { current: step + 1, total: STEPS.length })}
        showBack={step === 0}
        leading={
          step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="h-9 w-9 grid place-items-center rounded-full bg-canvas-100 text-ink-700 hover:bg-canvas-200"
              aria-label={t('common.back')}
            >
              <ArrowIcon size={18} className={cn(dir === 'rtl' ? '' : 'rotate-180')} />
            </button>
          ) : undefined
        }
      />

      <div className="px-4 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-ink-900' : 'bg-ink-100',
              )}
            />
          ))}
        </div>
      </div>

      <Screen>
        <div>
          <h1 className="text-[20px] font-bold text-ink-900">{t(current.titleKey)}</h1>
          <p className="mt-1.5 text-[13px] text-ink-500 leading-relaxed">{t(current.subKey)}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void goNext();
          }}
          noValidate
        >
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
              <FormField label={t('merchant.register.commercialReg')} required error={errors.commercialReg}>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={t('merchant.register.commercialRegPh')}
                  value={values.commercialReg}
                  onChange={onField('commercialReg')}
                  invalid={Boolean(errors.commercialReg)}
                  className="num"
                />
              </FormField>
              <FormField label={t('merchant.register.category')} required error={errors.category}>
                <Select
                  value={values.category}
                  onChange={onField('category')}
                  invalid={Boolean(errors.category)}
                >
                  <option value="" disabled>
                    {t('merchant.register.categoryPh')}
                  </option>
                  {CATEGORY_KEYS.map((c) => (
                    <option key={c} value={c}>
                      {t(`merchant.register.categories.${c}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
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
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={t('merchant.register.authorizedIdPh')}
                  value={values.authorizedId}
                  onChange={onField('authorizedId')}
                  invalid={Boolean(errors.authorizedId)}
                  className="num"
                />
              </FormField>
              <FormField label={t('merchant.register.contactPhone')} required error={errors.contactMobile}>
                <Input
                  inputMode="tel"
                  maxLength={9}
                  placeholder={t('merchant.register.contactPhonePh')}
                  value={values.contactMobile}
                  onChange={onField('contactMobile')}
                  invalid={Boolean(errors.contactMobile)}
                  leading={<span className="text-ink-500 text-[13px] font-medium num">+966</span>}
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
                    <Card key={b.key} padded className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13.5px] font-semibold text-ink-900">
                          {t('merchant.register.branchTitle', { index: idx + 1 })}
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
                            className="text-[12px] font-medium text-danger-600 hover:underline"
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
                        <Input
                          inputMode="tel"
                          maxLength={9}
                          placeholder={t('merchant.register.contactPhonePh')}
                          value={b.phone}
                          onChange={(e) => patchBranch(b.key, { phone: e.target.value })}
                          invalid={Boolean(be.phone)}
                          leading={
                            <span className="text-ink-500 text-[13px] font-medium num">+966</span>
                          }
                        />
                      </FormField>
                    </Card>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                block
                leading={<PlusIcon size={16} />}
                onClick={() => setValues((v) => ({ ...v, branches: [...v.branches, newBranch()] }))}
              >
                {t('merchant.register.addBranch')}
              </Button>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <ReviewCard title={t('merchant.register.review.account')}>
                <ReviewRow label={t('merchant.register.email')} value={values.email} ltr />
              </ReviewCard>
              <ReviewCard title={t('merchant.register.review.business')}>
                <ReviewRow label={t('merchant.register.companyName')} value={values.companyName} />
                <ReviewRow label={t('merchant.register.commercialReg')} value={values.commercialReg} ltr />
                <ReviewRow
                  label={t('merchant.register.review.categoryLabel')}
                  value={values.category ? t(`merchant.register.categories.${values.category}`) : '—'}
                />
              </ReviewCard>
              <ReviewCard title={t('merchant.register.review.representative')}>
                <ReviewRow label={t('merchant.register.authorizedName')} value={values.authorizedName} />
                {/* Masked on review — the full id travels only inside the
                    signup payload. */}
                <ReviewRow
                  label={t('merchant.register.authorizedId')}
                  value={maskNationalId(values.authorizedId.trim())}
                  ltr
                />
                <ReviewRow label={t('merchant.register.contactPhone')} value={`+966 ${values.contactMobile}`} ltr />
                <ReviewRow
                  label={t('merchant.register.contactEmail')}
                  value={values.contactEmail.trim() || values.email}
                  ltr
                />
              </ReviewCard>
              <ReviewCard title={t('merchant.register.review.branches')}>
                {values.branches.map((b, i) => (
                  <ReviewRow
                    key={b.key}
                    label={t('merchant.register.branchTitle', { index: i + 1 })}
                    value={`${b.name} · ${t(`register.cities.${b.city}`)} — ${b.address}`}
                  />
                ))}
              </ReviewCard>

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

          <div className="pt-2 space-y-2">
            <Button type="submit" size="lg" block loading={submitting}>
              {step === STEPS.length - 1
                ? t('merchant.register.submit')
                : t('common.continue')}
            </Button>
            {step === 0 && (
              <div className="text-center text-[13px] text-ink-500">
                {t('auth.haveAccount')}{' '}
                <Link to="/merchant/login" className="text-gold-700 font-semibold">
                  {t('merchant.entry.login')}
                </Link>
              </div>
            )}
          </div>
        </form>
      </Screen>
    </>
  );
}

function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        {title}
      </div>
      <div className="px-4 pb-3 space-y-2">{children}</div>
    </Card>
  );
}

function ReviewRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-ink-400">{label}</div>
      <div
        className="text-[13px] font-semibold text-ink-900 break-words"
        dir={ltr ? 'ltr' : undefined}
      >
        {value || '—'}
      </div>
    </div>
  );
}
