import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, FormField, Input } from '@/components/ui';
import {
  BadgeCheckIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LockIcon,
  ShieldIcon,
} from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { emptyRegistration } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';

type FieldErrors = {
  mobile?: string;
  email?: string;
  password?: string;
  form?: string;
};

function isValidSaudiMobile(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^5\d{8}$/.test(digits);
}

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const { completeRegistration, updateDraft } = useStore();
  const { configured, signIn } = useSupabaseAuth();
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const mobileError = useMemo(() => {
    if (configured) return undefined;
    if (!touched.mobile && !errors.mobile) return undefined;
    if (!mobile.trim()) return t('auth.errors.mobileRequired');
    if (!isValidSaudiMobile(mobile)) return t('auth.errors.mobileFormat');
    return undefined;
  }, [configured, mobile, touched.mobile, errors.mobile, t]);

  const emailError = useMemo(() => {
    if (!configured) return undefined;
    if (!touched.email && !errors.email) return undefined;
    if (!email.trim()) return t('auth.errors.emailRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t('auth.errors.emailFormat');
    return undefined;
  }, [configured, email, touched.email, errors.email, t]);

  // Real (configured) auth uses Supabase's default 6-char minimum so the
  // sign-in rule matches the sign-up rule. Demo (mobile-only) keeps the
  // looser 4-char hint since it's a local-only stub.
  const minPasswordChars = configured ? 6 : 4;
  const passwordError = useMemo(() => {
    if (!touched.password && !errors.password) return undefined;
    if (!password.trim()) return t('auth.errors.passwordRequired');
    if (password.length < minPasswordChars)
      return configured
        ? t('auth.errors.passwordMinChars')
        : t('auth.errors.passwordShort');
    return undefined;
  }, [password, touched.password, errors.password, t, minPasswordChars, configured]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors((prev) => ({ ...prev, form: undefined }));

    if (configured) {
      setTouched({ email: true, password: true });
      const next: FieldErrors = {};
      if (!email.trim()) next.email = t('auth.errors.emailRequired');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        next.email = t('auth.errors.emailFormat');
      if (!password.trim()) next.password = t('auth.errors.passwordRequired');
      else if (password.length < 6) next.password = t('auth.errors.passwordMinChars');
      setErrors(next);
      if (Object.keys(next).length > 0) return;

      setSubmitting(true);
      try {
        await signIn({ email: email.trim(), password });
        // Provider's onAuthStateChange will hydrate role; let RootRedirect route us.
        navigate('/', { replace: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : t('auth.errors.signInFailed');
        setErrors({ form: message });
        setSubmitting(false);
      }
      return;
    }

    // Demo mode (env not configured)
    setTouched({ mobile: true, password: true });
    const next: FieldErrors = {};
    if (!mobile.trim()) next.mobile = t('auth.errors.mobileRequired');
    else if (!isValidSaudiMobile(mobile)) next.mobile = t('auth.errors.mobileFormat');
    if (!password.trim()) next.password = t('auth.errors.passwordRequired');
    else if (password.length < 4) next.password = t('auth.errors.passwordShort');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    updateDraft({
      ...emptyRegistration,
      fullName: 'Demo User',
      mobile,
    });
    window.setTimeout(() => {
      completeRegistration(true);
      navigate('/home', { replace: true });
    }, 700);
  };

  const fillDemoCredentials = () => {
    setMobile('501234567');
    setEmail('demo@applux.app');
    setPassword('demo1234');
    setErrors({});
    setTouched({});
  };

  return (
    <>
      <Header title={t('auth.loginTitle')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-6">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-18%] h-52 w-52 rounded-full bg-gold-400/22 blur-[80px]"
            />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold">
                <BadgeCheckIcon size={12} />
                {t('auth.login.trust')}
              </span>
              <h1 className="mt-4 editorial-title text-[24px] leading-tight text-white">
                {t('auth.loginTitle')}
              </h1>
              <p className="mt-2 text-[13px] text-white/65 leading-relaxed max-w-[34ch]">
                {t('auth.loginSubtitle')}
              </p>
            </div>
          </div>

          {/* Demo hint */}
          <div className="rounded-xl3 bg-gold-50 p-4 flex items-start gap-3.5">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-white text-gold-700 grid place-items-center hairline">
              <InfoIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12.5px] text-ink-700 leading-relaxed">
              <div className="font-semibold mb-0.5 text-ink-900 text-[13px] tracking-tight">
                {t('auth.login.demoTitle')}
              </div>
              <div>{t('auth.login.demoHint')}</div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-gold-700 hover:text-gold-600"
              >
                {t('auth.login.demoFill')}
              </button>
            </div>
          </div>

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            {configured ? (
              <FormField label={t('auth.email')} required error={emailError}>
                <Input
                  type="email"
                  placeholder={t('auth.emailPh')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  invalid={Boolean(emailError)}
                  autoComplete="email"
                />
              </FormField>
            ) : (
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
                  onChange={(e) => setMobile(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, mobile: true }))}
                  leading={
                    <span className="text-ink-500 text-[13px] font-medium num">+966</span>
                  }
                  invalid={Boolean(mobileError)}
                  autoComplete="tel"
                  maxLength={10}
                />
              </FormField>
            )}
            <FormField
              label={t('auth.password')}
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
                className="text-[12.5px] font-medium text-gold-700 hover:text-gold-600"
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
              {submitting ? t('auth.login.submitting') : t('auth.login')}
            </Button>

            <div className="flex items-center gap-3 text-[11px] text-ink-400">
              <span className="h-px flex-1 bg-canvas-200" />
              <span className="tracking-tight">{t('auth.login.or')}</span>
              <span className="h-px flex-1 bg-canvas-200" />
            </div>

            <Link to="/auth/nafath" className="block">
              <Button
                type="button"
                size="lg"
                variant="secondary"
                block
                leading={<ShieldIcon size={16} />}
              >
                {t('auth.login.continueNafath')}
              </Button>
            </Link>

            <Card padded className="flex items-start gap-3.5">
              <span className="h-10 w-10 shrink-0 rounded-2xl bg-gold-50 text-gold-700 grid place-items-center">
                <LockIcon size={16} />
              </span>
              <div className="min-w-0 text-[12.5px] text-ink-500 leading-relaxed">
                <div className="text-ink-900 font-semibold mb-0.5 text-[13px] tracking-tight">
                  {t('auth.login.security.title')}
                </div>
                <div>{t('auth.login.security.hint')}</div>
              </div>
            </Card>

            <div className="text-center text-[13px] text-ink-500 pt-1">
              {t('auth.noAccount')}{' '}
              <Link to="/auth/register" className="text-gold-700 font-semibold hover:text-gold-600">
                {t('auth.register')}
              </Link>
            </div>
          </form>
        </div>
      </Screen>
    </>
  );
}
