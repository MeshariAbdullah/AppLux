import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input, Select, Textarea } from '@/components/ui';
import { useI18n, useT } from '@/lib/i18n';
import { useStore, emptyRegistration, type RegistrationDraft } from '@/lib/store';
import { useSupabaseAuth, updateProfile } from '@/lib/supabase';
import { classifyMobile, type MobileIssue } from '@/lib/mobile';
import { cn } from '@/lib/cn';
import { ArrowIcon, BadgeCheckIcon, ShieldIcon } from '@/components/icons';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';

const CITY_KEYS = [
  'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'tabuk',
  'abha', 'taif', 'qassim', 'hail', 'najran', 'jazan', 'baha', 'yanbu',
] as const;

const PROFESSION_KEYS = [
  'private', 'government', 'freelance', 'business', 'retired', 'student', 'other',
] as const;

type FieldKey = keyof RegistrationDraft;
type Errors = Partial<Record<FieldKey, string>>;

const STEPS: { key: FieldKey[]; titleKey: string; subKey: string }[] = [
  { key: ['fullName', 'nationalId', 'dob'], titleKey: 'register.step1', subKey: 'register.step1Sub' },
  { key: ['mobile', 'email', 'city', 'address'], titleKey: 'register.step2', subKey: 'register.step2Sub' },
  { key: ['profession', 'employer', 'income'], titleKey: 'register.step3', subKey: 'register.step3Sub' },
];

export default function Register() {
  const t = useT();
  const { dir } = useI18n();
  const navigate = useNavigate();
  const { draft, updateDraft, resetDraft } = useStore();
  const { configured } = useSupabaseAuth();

  // In production without Supabase env, refuse to render the demo
  // multi-step register (otherwise the user completes a fake form
  // that never creates an account). In dev the demo flow stays
  // available for local exploration.
  if (isMisconfiguredProduction(configured)) {
    return <ProductionConfigError />;
  }

  // When the Supabase env is wired, the heavy 3-step demo registration is
  // replaced by a minimal email/password sign-up. The demo flow stays as-is.
  if (configured) {
    return <SupabaseRegister />;
  }

  const [values, setValues] = useState<RegistrationDraft>(() =>
    draft.fullName || draft.mobile ? draft : emptyRegistration,
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});

  const current = STEPS[step];
  const totalSteps = STEPS.length;
  const progress = ((step + 1) / totalSteps) * 100;

  const onChange = (key: FieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (keys: FieldKey[]): Errors => {
    const next: Errors = {};
    const req = t('register.errors.required');
    for (const k of keys) {
      const v = values[k].trim();
      if (!v) {
        next[k] = req;
        continue;
      }
      if (k === 'nationalId' && !/^[12]\d{9}$/.test(v)) next[k] = t('register.errors.nationalId');
      if (k === 'mobile' && !/^5\d{8}$/.test(v)) next[k] = t('register.errors.mobile');
      if (k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) next[k] = t('register.errors.email');
      if (k === 'income' && !(Number(v) > 0)) next[k] = t('register.errors.income');
    }
    return next;
  };

  const goNext = () => {
    const e = validate(current.key);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }
    updateDraft(values);
    navigate('/auth/nafath');
  };

  const goBack = () => {
    if (step === 0) {
      resetDraft();
      navigate(-1);
      return;
    }
    setStep((s) => s - 1);
  };

  const cities = useMemo(
    () => CITY_KEYS.map((c) => ({ key: c, label: t(`register.cities.${c}`) })),
    [t],
  );
  const professions = useMemo(
    () => PROFESSION_KEYS.map((p) => ({ key: p, label: t(`register.professions.${p}`) })),
    [t],
  );

  return (
    <>
      <Header
        title={t('register.title')}
        subtitle={t('register.step', { current: step + 1, total: totalSteps })}
        showBack={step === 0}
        leading={
          step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="h-10 w-10 grid place-items-center rounded-full bg-white text-ink-800 hairline hover:bg-canvas-100 transition-colors"
              aria-label={t('common.back')}
            >
              <ArrowIcon size={18} className={cn(dir === 'rtl' ? '' : 'rotate-180')} />
            </button>
          ) : undefined
        }
      />

      <div className="px-5 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-gold-400' : 'bg-canvas-200',
              )}
            />
          ))}
        </div>
        <div className="sr-only">{Math.round(progress)}%</div>
      </div>

      <Screen className="bg-canvas">
        <div>
          <h1 className="editorial-title text-[24px] text-ink-900 leading-tight">{t(current.titleKey)}</h1>
          <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">{t(current.subKey)}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
          noValidate
        >
          {step === 0 && (
            <>
              <FormField label={t('register.fullName')} required error={errors.fullName}>
                <Input
                  placeholder={t('register.fullNamePh')}
                  value={values.fullName}
                  onChange={onChange('fullName')}
                  invalid={Boolean(errors.fullName)}
                  autoComplete="name"
                />
              </FormField>
              <FormField label={t('register.nationalId')} required error={errors.nationalId}>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={t('register.nationalIdPh')}
                  value={values.nationalId}
                  onChange={onChange('nationalId')}
                  invalid={Boolean(errors.nationalId)}
                  className="num"
                />
              </FormField>
              <FormField label={t('register.dob')} required error={errors.dob}>
                <Input
                  type="date"
                  value={values.dob}
                  onChange={onChange('dob')}
                  invalid={Boolean(errors.dob)}
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormField label={t('register.mobile')} required error={errors.mobile}>
                <Input
                  inputMode="tel"
                  maxLength={9}
                  placeholder={t('register.mobilePh')}
                  value={values.mobile}
                  onChange={onChange('mobile')}
                  invalid={Boolean(errors.mobile)}
                  leading={<span className="text-ink-500 text-[13px] font-medium num">+966</span>}
                />
              </FormField>
              <FormField label={t('register.email')} required error={errors.email}>
                <Input
                  type="email"
                  placeholder={t('register.emailPh')}
                  value={values.email}
                  onChange={onChange('email')}
                  invalid={Boolean(errors.email)}
                  autoComplete="email"
                />
              </FormField>
              <FormField label={t('register.city')} required error={errors.city}>
                <Select
                  value={values.city}
                  onChange={onChange('city')}
                  invalid={Boolean(errors.city)}
                >
                  <option value="" disabled>
                    {t('register.cityPh')}
                  </option>
                  {cities.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('register.address')} required error={errors.address}>
                <Textarea
                  placeholder={t('register.addressPh')}
                  rows={3}
                  value={values.address}
                  onChange={onChange('address')}
                  invalid={Boolean(errors.address)}
                />
              </FormField>
            </>
          )}

          {step === 2 && (
            <>
              <FormField label={t('register.profession')} required error={errors.profession}>
                <Select
                  value={values.profession}
                  onChange={onChange('profession')}
                  invalid={Boolean(errors.profession)}
                >
                  <option value="" disabled>
                    {t('register.professionPh')}
                  </option>
                  {professions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('register.employer')} required error={errors.employer}>
                <Input
                  placeholder={t('register.employerPh')}
                  value={values.employer}
                  onChange={onChange('employer')}
                  invalid={Boolean(errors.employer)}
                />
              </FormField>
              <FormField label={t('register.income')} required error={errors.income}>
                <Input
                  inputMode="numeric"
                  placeholder={t('register.incomePh')}
                  value={values.income}
                  onChange={onChange('income')}
                  invalid={Boolean(errors.income)}
                  className="num"
                  trailing={
                    <span className="text-ink-400 text-[12.5px] font-medium">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>

              <div className="rounded-xl3 bg-gold-50 p-4 flex items-start gap-3.5">
                <span className="h-10 w-10 shrink-0 rounded-2xl bg-white text-gold-700 grid place-items-center hairline">
                  <ShieldIcon size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-brand-900">
                    {t('nafath.pill')}
                  </div>
                  <div className="mt-0.5 text-[12px] text-brand-800/80 leading-relaxed">
                    {t('nafath.subtitle')}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="pt-2 space-y-2">
            <Button type="submit" size="lg" block>
              {step === totalSteps - 1 ? t('register.submit') : t('common.continue')}
            </Button>
            {step === 0 && (
              <div className="text-center text-[13px] text-ink-500">
                {t('auth.haveAccount')}{' '}
                <Link to="/auth/login" className="text-gold-700 font-semibold">
                  {t('auth.signIn')}
                </Link>
              </div>
            )}
          </div>
        </form>
      </Screen>
    </>
  );
}

/**
 * Maps a mobile classification issue to a user-facing message. Every
 * caller renders the same wording — we never fall back to a generic
 * "invalid number" string.
 */
function mobileIssueToMessage(
  issue: MobileIssue,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  switch (issue) {
    case 'empty':
      return t('auth.errors.mobileRequired');
    case 'incomplete':
      return t('auth.errors.mobileIncomplete');
    case 'unsupported_country':
      return t('auth.errors.mobileUnsupportedCountry');
    case 'invalid_format':
    default:
      return t('auth.errors.mobileFormat');
  }
}

/**
 * Best-effort detector for a unique-violation on profiles.mobile
 * (the partial unique index installed in
 * 20260502121200_profiles_mobile_customer_unique.sql). Supabase Auth
 * doesn't expose the underlying Postgres code reliably through
 * signUp's error, so we sniff a few plausible signals: 23505 code,
 * the constraint name, and the column/table name in the message.
 * Conservative on purpose — if we're not sure, we DON'T claim it's a
 * duplicate (the caller falls back to the generic error path).
 */
function isMobileUniqueViolation(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { code?: string; message?: string };
  if (anyErr.code === '23505') return true;
  const msg = (anyErr.message ?? '').toLowerCase();
  return (
    msg.includes('profiles_mobile_customer_unique') ||
    (msg.includes('duplicate') && msg.includes('mobile')) ||
    (msg.includes('already exists') && msg.includes('mobile'))
  );
}

function SupabaseRegister() {
  const t = useT();
  const navigate = useNavigate();
  const { signUp, configured, status } = useSupabaseAuth();

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [mobileTouched, setMobileTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /**
   * When Supabase has email-confirmation enabled, signUp resolves with
   * { user, session: null } — the new user is registered but NOT logged
   * in. We must NOT navigate to '/' in that case (RootRedirect would
   * see status='anonymous' and bounce to /welcome, looking like signup
   * failed). Instead we render a "check your email" panel until the
   * user clicks the confirmation link and signs in manually.
   */
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);
  const [errors, setErrors] = useState<{
    fullName?: string;
    mobile?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    form?: string;
  }>({});

  // Post-auth handoff — same pattern as Login / MerchantLogin (commit
  // 566be09). signUp's session, when it returns one, propagates through
  // onAuthStateChange → loadUserContext → setStatus('authenticated')
  // asynchronously. Navigating synchronously after `await signUp` would
  // race that update and bounce to /welcome. Observing `status` removes
  // the race. RootRedirect (routes.tsx) owns role routing from '/'.
  useEffect(() => {
    if (configured && status === 'authenticated') {
      navigate('/', { replace: true });
    }
  }, [configured, status, navigate]);

  // Live validation — the user sees an inline error the moment they
  // blur an unsupported number, and a confirmation chip with the
  // canonical E.164 form once the input parses cleanly. The DB CHECK
  // constraint on profiles.mobile remains the single source of truth.
  const mobileClassification = classifyMobile(mobile);
  const normalizedMobile =
    mobileClassification.kind === 'valid' ? mobileClassification : null;
  const liveMobileError =
    mobileTouched && mobile.trim().length > 0 && mobileClassification.kind === 'invalid'
      ? mobileIssueToMessage(mobileClassification.issue, t)
      : undefined;
  const mobileError = errors.mobile ?? liveMobileError;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!fullName.trim()) next.fullName = t('auth.errors.fullNameRequired');
    if (!mobile.trim()) next.mobile = t('auth.errors.mobileRequired');
    else if (mobileClassification.kind === 'invalid')
      next.mobile = mobileIssueToMessage(mobileClassification.issue, t);
    if (!email.trim()) next.email = t('auth.errors.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t('auth.errors.emailFormat');
    if (!password.trim()) next.password = t('auth.errors.passwordRequired');
    else if (password.length < 6) next.password = t('auth.errors.passwordMinChars');
    if (!confirmPassword.trim())
      next.confirmPassword = t('auth.errors.confirmPasswordRequired');
    else if (password && confirmPassword !== password)
      next.confirmPassword = t('auth.errors.passwordMismatch');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        mobile: normalizedMobile!.canonical,
      });
      // Two outcomes from Supabase signUp:
      //  (a) project has email-confirmation enabled → result.session is
      //      null and the user must confirm via email before logging in.
      //      Show a clear "check your email" panel; do NOT navigate.
      //  (b) email-confirmation disabled → result.session is populated,
      //      Supabase fires onAuthStateChange, provider hydrates, the
      //      useEffect above navigates to '/'. Nothing to do here.
      //
      // Belt-and-suspenders mobile persistence (case b only):
      // The mobile is sent via signUp's auth metadata and the
      // handle_new_auth_user trigger should copy it onto profiles.mobile.
      // If a project is still running the old trigger (the one that
      // pre-dates 20260502120600 / 20260502120800), profile.mobile
      // would be NULL. The new session lets us write our own row via
      // the profiles_self_update RLS policy, so do a defensive UPDATE
      // here. Errors are non-fatal — the trigger is the primary path
      // and is now defensive on the DB side too.
      if (result.session?.user) {
        try {
          await updateProfile(result.session.user.id, {
            mobile: normalizedMobile!.canonical,
          });
        } catch (err) {
          // SCRUM-42 Bug 15: a unique-violation on profiles.mobile
          // means another customer already registered with this
          // number (partial unique index
          // `profiles_mobile_customer_unique`). Surface a clean
          // "already registered" error on the mobile field instead
          // of silently swallowing — the trigger should have written
          // it on signup, so if the post-signUp UPDATE fails on
          // 23505 there's nothing we can do client-side to recover.
          if (isMobileUniqueViolation(err)) {
            setErrors({ mobile: t('auth.errors.mobileTaken') });
            setSubmitting(false);
            return;
          }
          // eslint-disable-next-line no-console
          console.error(
            '[lend] post-signUp mobile persist failed (trigger should have set it)',
            err,
          );
        }
      } else {
        setPendingEmailConfirmation(true);
        setSubmitting(false);
      }
    } catch (err) {
      // The handle_new_auth_user trigger ALSO writes profiles.mobile.
      // If the live data already contains another customer with this
      // number, the trigger's INSERT will fail with a 23505 unique
      // violation, which Supabase Auth surfaces as a sign-up error.
      // Translate that into the same clean "already registered"
      // message on the mobile field.
      if (isMobileUniqueViolation(err)) {
        setErrors({ mobile: t('auth.errors.mobileTaken') });
        setSubmitting(false);
        return;
      }
      const message = err instanceof Error ? err.message : t('auth.errors.signUpFailed');
      setErrors({ form: message });
      setSubmitting(false);
    }
  };

  if (pendingEmailConfirmation) {
    // signUp succeeded but session is null → Supabase project has
    // email-confirmation enabled. Render a clear "check your email"
    // state instead of bouncing through RootRedirect / /welcome.
    return (
      <>
        <Header title={t('register.title')} showBack />
        <Screen className="bg-canvas">
          <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-5 shadow-soft space-y-3">
            <div className="h-11 w-11 rounded-2xl bg-gold-50 text-gold-700 grid place-items-center">
              <BadgeCheckIcon size={20} />
            </div>
            <h1 className="editorial-title text-[20px] text-ink-900 leading-tight">
              {t('register.emailConfirm.title')}
            </h1>
            <p className="text-[13px] text-ink-500 leading-relaxed">
              {t('register.emailConfirm.body', { email: email.trim() })}
            </p>
          </div>
          <Link
            to="/auth/login"
            className="block text-center text-[13px] text-lavender-700 font-semibold pt-2"
          >
            {t('register.emailConfirm.goToLogin')}
          </Link>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Header title={t('register.title')} showBack />
      <Screen className="bg-canvas">
        <div>
          <h1 className="editorial-title text-[24px] text-ink-900 leading-tight">
            {t('register.title')}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">
            {t('register.step1Sub')}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField label={t('register.fullName')} required error={errors.fullName}>
            <Input
              placeholder={t('register.fullNamePh')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              invalid={Boolean(errors.fullName)}
              autoComplete="name"
            />
          </FormField>
          <FormField
            label={t('auth.mobile')}
            required
            error={mobileError}
            hint={!mobileError ? t('auth.login.mobileHint') : undefined}
          >
            <Input
              inputMode="tel"
              placeholder="5XXXXXXXX"
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value);
                if (errors.mobile) setErrors((p) => ({ ...p, mobile: undefined }));
              }}
              onBlur={() => setMobileTouched(true)}
              leading={
                <span className="text-ink-500 text-[13px] font-medium num">+966</span>
              }
              invalid={Boolean(mobileError)}
              autoComplete="tel"
              maxLength={14}
            />
          </FormField>
          {normalizedMobile && (
            <div
              className="-mt-2 rounded-xl2 bg-canvas-100/70 ring-1 ring-canvas-200 px-3.5 py-2 text-[11.5px] text-ink-500 flex items-center gap-2"
              aria-live="polite"
            >
              <BadgeCheckIcon size={12} className="text-lavender-600 shrink-0" />
              <span className="num">
                {t('auth.mobileAccepted', { e164: normalizedMobile.e164 })}
              </span>
            </div>
          )}
          <FormField label={t('auth.email')} required error={errors.email}>
            <Input
              type="email"
              placeholder={t('auth.emailPh')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={Boolean(errors.email)}
              autoComplete="email"
            />
          </FormField>
          <FormField
            label={t('auth.password')}
            required
            error={errors.password}
            hint={!errors.password ? t('auth.passwordHint') : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={Boolean(errors.password)}
              autoComplete="new-password"
            />
          </FormField>
          <FormField
            label={t('auth.confirmPassword')}
            required
            error={errors.confirmPassword}
          >
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              invalid={Boolean(errors.confirmPassword)}
              autoComplete="new-password"
            />
          </FormField>

          {errors.form && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
              {errors.form}
            </div>
          )}

          <div className="pt-2 space-y-2">
            <Button type="submit" size="lg" block loading={submitting}>
              {t('register.submit')}
            </Button>
            <div className="text-center text-[13px] text-ink-500">
              {t('auth.haveAccount')}{' '}
              <Link
                to="/auth/login"
                className="text-lavender-600 font-semibold hover:text-lavender-700"
              >
                {t('auth.signIn')}
              </Link>
            </div>
          </div>
        </form>
      </Screen>
    </>
  );
}
