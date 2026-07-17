import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { Button, FormField, Input } from '@/components/ui';
import {
  ArrowIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
} from '@/components/icons';
import { LendLogo } from '@/components/brand/Logo';
import { translateAuthError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { listMerchantApplications, useSupabaseAuth } from '@/lib/supabase';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  email?: string;
  password?: string;
  form?: string;
};

export default function MerchantLogin() {
  const t = useT();
  const navigate = useNavigate();
  const { updateMerchantDraft, submitMerchantApproval, approveMerchant } =
    useStore();
  const {
    configured,
    signIn,
    signOut: supabaseSignOut,
    status,
    role,
    profileLoading,
  } = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Merchant separation M2: customer credentials on the MERCHANT login
  // are signed out with a wrong-account-type message — EXCEPT legacy
  // customer-based applicants (pre-separation queue), who are still
  // routed to their application status page until the queue drains.
  const [wrongAccountType, setWrongAccountType] = useState(false);
  const routingRef = useRef(false);

  // Post-auth handoff. Merchant accounts release to '/' — RootRedirect
  // sends active merchants to the dashboard and pending/rejected ones
  // to the application-status page. Customer credentials: legacy
  // applicants (existing application) go to their status page; plain
  // customers are signed out with the wrong-account-type message.
  useEffect(() => {
    if (!configured || status !== 'authenticated' || profileLoading) return;
    if (routingRef.current) return;
    routingRef.current = true;
    if (role === 'customer') {
      void (async () => {
        const apps = await listMerchantApplications({ limit: 1 }).catch(() => []);
        if (apps.length > 0) {
          navigate('/merchant/pending', { replace: true });
        } else {
          await supabaseSignOut().catch(() => {});
          setWrongAccountType(true);
          setSubmitting(false);
        }
      })();
    } else {
      navigate('/', { replace: true });
    }
  }, [configured, status, profileLoading, role, navigate, supabaseSignOut]);

  const emailError = useMemo(() => {
    if (!touched.email && !errors.email) return undefined;
    if (!email.trim()) return t('merchant.login.errors.emailRequired');
    if (!EMAIL_RE.test(email)) return t('merchant.login.errors.emailFormat');
    return undefined;
  }, [email, touched.email, errors.email, t]);

  // Real (configured) auth uses Supabase's default 6-char minimum so the
  // sign-in rule matches the sign-up rule. Demo path keeps min 4.
  const minPasswordChars = configured ? 6 : 4;
  const passwordError = useMemo(() => {
    if (!touched.password && !errors.password) return undefined;
    if (!password.trim()) return t('merchant.login.errors.passwordRequired');
    if (password.length < minPasswordChars)
      return configured
        ? t('auth.errors.passwordMinChars')
        : t('merchant.login.errors.passwordShort');
    return undefined;
  }, [password, touched.password, errors.password, t, minPasswordChars, configured]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setErrors((prev) => ({ ...prev, form: undefined }));
    // Fresh attempt — allow the post-auth routing to run again.
    routingRef.current = false;
    setWrongAccountType(false);

    const next: FieldErrors = {};
    if (!email.trim()) next.email = t('merchant.login.errors.emailRequired');
    else if (!EMAIL_RE.test(email))
      next.email = t('merchant.login.errors.emailFormat');
    if (!password.trim())
      next.password = t('merchant.login.errors.passwordRequired');
    else if (password.length < minPasswordChars)
      next.password = configured
        ? t('auth.errors.passwordMinChars')
        : t('merchant.login.errors.passwordShort');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);

    // Real Supabase auth — provider's onAuthStateChange will hydrate role,
    // then the post-auth effect above routes us to '/' and RootRedirect
    // sends merchants to /merchant/home.
    if (configured) {
      try {
        await signIn({ email: email.trim(), password });
        // Intentionally no navigate() here — see useEffect comment above.
        return;
      } catch (err) {
        logEvent('auth_failure', 'warn', { op: 'merchant_sign_in' }, err);
        setErrors({ form: translateAuthError(err, t) });
        setSubmitting(false);
        return;
      }
    }

    // Demo path
    updateMerchantDraft({
      companyName: 'Lend Demo Partner',
      commercialReg: '1010123456',
      authorizedName: 'Demo Merchant',
      authorizedId: '1012345678',
      iban: 'SA0380000000608010167519',
      city: 'riyadh',
      address: 'King Fahd Road, Riyadh',
      contactEmail: email,
      contactPhone: '500000000',
      branches: [
        {
          id: `BR-${Date.now().toString().slice(-4)}`,
          name: 'Riyadh HQ',
          city: 'riyadh',
          address: 'King Fahd Road, Riyadh',
          phone: '500000000',
        },
      ],
    });
    window.setTimeout(() => {
      submitMerchantApproval();
      approveMerchant();
      navigate('/merchant/home', { replace: true });
    }, 700);
  };

  const fillDemoCredentials = () => {
    setEmail('partner@applux.demo');
    setPassword('demo1234');
    setErrors({});
    setTouched({});
  };

  if (isMisconfiguredProduction(configured)) {
    return <ProductionConfigError />;
  }

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        {/* M08 has no header bar — a floating back square keeps the
            navigation affordance (Capacitor has no browser chrome). */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="absolute z-10 top-[calc(env(safe-area-inset-top)+14px)] start-5 h-9 w-9 grid place-items-center rounded-[10px] bg-white text-navy-700 shadow-soft"
        >
          <ArrowIcon size={16} className="rtl:rotate-0 ltr:rotate-180" />
        </button>
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-10 space-y-5">
          {/* M08 masthead — centered mark, portal title, account-type chip */}
          <div className="flex flex-col items-center gap-3 pt-6">
            <LendLogo variant="mark" theme="light" size={52} />
            <h1 className="text-[22px] font-bold text-navy-700 leading-tight">
              {t('merchant.login.portal')}
            </h1>
            <span className="rounded-full bg-navy-50 text-navy-700 px-3.5 py-1.5 text-[11.5px] font-bold">
              {t('merchant.login.badge')}
            </span>
          </div>

          {/* Demo hint — DEMO MODE ONLY. Production merchants must
              never see demo credentials or a demo-fill affordance. */}
          {!configured && (
            <div className="rounded-xl2 bg-gold-50 ring-1 ring-gold-400/30 p-3.5 flex items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-gold-600 grid place-items-center ring-1 ring-gold-400/30">
                <InfoIcon size={16} />
              </span>
              <div className="min-w-0 flex-1 text-[12px] text-ink-700 leading-relaxed">
                <div className="font-semibold mb-0.5 text-ink-900 text-[12.5px]">
                  {t('merchant.login.demoTitle')}
                </div>
                <div>{t('merchant.login.demoHint')}</div>
                <button
                  type="button"
                  onClick={fillDemoCredentials}
                  className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-gold-600 hover:underline"
                >
                  {t('merchant.login.demoFill')}
                </button>
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <FormField
              label={t('merchant.login.email')}
              required
              error={emailError}
            >
              <Input
                type="email"
                placeholder={t('merchant.login.emailPh')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                invalid={Boolean(emailError)}
                autoComplete="email"
              />
            </FormField>
            <FormField
              label={t('merchant.login.password')}
              required
              error={passwordError}
            >
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                invalid={Boolean(passwordError)}
                autoComplete="current-password"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={
                      showPassword
                        ? t('auth.login.hidePassword')
                        : t('auth.login.showPassword')
                    }
                    className="text-ink-400 hover:text-ink-700 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOffIcon size={16} />
                    ) : (
                      <EyeIcon size={16} />
                    )}
                  </button>
                }
              />
            </FormField>

            <div className="flex justify-end">
              <Link
                to="/auth/forgot-password"
                className="text-[12.5px] font-semibold text-lavender-700 hover:text-lavender-800"
              >
                {t('auth.forgot')}
              </Link>
            </div>

            {errors.form && (
              <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
                {errors.form}
              </div>
            )}

            {wrongAccountType && (
              <div className="rounded-xl2 bg-navy-50 ring-1 ring-navy-200 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-ink-800 leading-relaxed">
                <span className="h-5 w-5 shrink-0 rounded-full bg-navy-700 text-white grid place-items-center text-[12px] font-bold num">
                  i
                </span>
                <span>
                  {t('merchant.login.errors.customerAccountOnMerchantLogin')}{' '}
                  <Link
                    to="/auth/login"
                    className="font-bold text-navy-700 underline underline-offset-4"
                  >
                    {t('merchant.login.goToCustomerLogin')}
                  </Link>
                </span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              block
              loading={submitting}
              className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
            >
              {submitting
                ? t('auth.login.submitting')
                : t('merchant.login.submit')}
            </Button>

            <p className="text-center text-[11px] text-ink-400 leading-relaxed inline-flex items-center gap-1 justify-center w-full">
              <LockIcon size={11} />
              {t('auth.entry.encrypted')}
            </p>

            <div className="text-center text-[13px] text-ink-500">
              {t('merchant.login.noAccount')}{' '}
              <Link to="/merchant/register" className="font-bold text-navy-700 hover:text-green-700">
                {t('merchant.login.apply')}
              </Link>
            </div>
          </form>
        </div>
      </Screen>
    </>
  );
}
