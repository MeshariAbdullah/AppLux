import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, FormField, Input } from '@/components/ui';
import {
  BadgeCheckIcon,
  BuildingIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  ShieldIcon,
} from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';

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
  const { configured, signIn, status } = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Post-auth handoff — see the matching block + architecture note in
  // src/pages/auth/Login.tsx. This page does NOT route by role; it just
  // releases the user to '/' once the provider hydrates. RootRedirect
  // (routes.tsx) is the single role-routing point and sends merchants
  // to /merchant/home.
  useEffect(() => {
    if (configured && status === 'authenticated') {
      navigate('/', { replace: true });
    }
  }, [configured, status, navigate]);

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
        const message =
          err instanceof Error ? err.message : t('auth.errors.signInFailed');
        setErrors({ form: message });
        setSubmitting(false);
        return;
      }
    }

    // Demo path
    updateMerchantDraft({
      companyName: 'AppLux Demo Partner',
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

  return (
    <>
      <Header title={t('merchant.login.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-15%] h-48 w-48 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <BuildingIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2 py-0.5 text-[11px] font-semibold">
                  <BadgeCheckIcon size={12} />
                  {t('merchant.login.trust')}
                </span>
                <h1 className="mt-2 text-[20px] font-bold leading-tight">
                  {t('merchant.login.title')}
                </h1>
                <p className="mt-1.5 text-[12.5px] text-white/70 leading-relaxed">
                  {t('merchant.login.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Demo hint */}
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
              <button
                type="button"
                className="text-[12.5px] font-medium text-gold-700 hover:text-gold-700"
              >
                {t('auth.forgot')}
              </button>
            </div>

            {errors.form && (
              <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
                {errors.form}
              </div>
            )}

            <Button type="submit" size="lg" block loading={submitting}>
              {submitting
                ? t('auth.login.submitting')
                : t('merchant.login.submit')}
            </Button>

            <Card padded className="flex items-start gap-3 bg-white">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-success-50 text-success-600 grid place-items-center ring-1 ring-success-500/15">
                <ShieldIcon size={16} />
              </span>
              <div className="min-w-0 text-[12px] text-ink-600 leading-relaxed">
                <div className="text-ink-900 font-semibold mb-0.5 text-[12.5px]">
                  {t('merchant.login.security.title')}
                </div>
                <div>{t('merchant.login.security.hint')}</div>
              </div>
            </Card>

            <p className="text-center text-[11px] text-ink-400 leading-relaxed inline-flex items-center gap-1 justify-center w-full">
              <LockIcon size={11} />
              {t('auth.entry.encrypted')}
            </p>

            <div className="text-center text-[13px] text-ink-500">
              {t('merchant.login.noAccount')}{' '}
              <Link to="/merchant/register" className="text-gold-700 font-semibold">
                {t('merchant.login.register')}
              </Link>
            </div>
          </form>
        </div>
      </Screen>
    </>
  );
}
