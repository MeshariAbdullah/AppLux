import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
import { translateAuthError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useStore } from '@/lib/store';
import { emptyRegistration } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';

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
  const location = useLocation();
  const { completeRegistration, updateDraft } = useStore();
  const { configured, signIn, status } = useSupabaseAuth();
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Post-auth handoff — single redirect, driven by provider state.
  //
  // Architecture: the login page's only job is to RELEASE the user once
  // the provider has finished hydrating; it does NOT decide which home
  // to land on. That decision lives in RootRedirect (routes.tsx) — the
  // single role-routing point in the app. We just navigate to '/' and
  // RootRedirect maps role → /merchant/home, /admin/home, or /home.
  //
  // Why this effect instead of a synchronous navigate after signIn:
  // `signInWithPassword` fires `onAuthStateChange` synchronously before
  // returning, but the listener's `setStatus('authenticated')` only runs
  // after `await loadUserContext` resolves a few ticks later. A
  // synchronous Navigate would render RootRedirect with `status` still
  // at 'anonymous' and bounce the user to /welcome. Watching `status`
  // removes the race. The same effect also covers the case where the
  // user lands on /auth/login while already authenticated.
  useEffect(() => {
    if (configured && status === 'authenticated') {
      // Auth Hardening Phase 1: honor an internal return path (e.g. the
      // merchant-register gate sends `state.from = '/merchant/register'`
      // so the applicant lands back on the application after signing
      // in). Only same-app absolute paths are accepted — anything else
      // falls through to '/' and RootRedirect's role routing.
      const from = (location.state as { from?: string } | null)?.from;
      const target =
        typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
          ? from
          : '/';
      navigate(target, { replace: true });
    }
  }, [configured, status, navigate, location.state]);

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
        // Do NOT navigate here. The useEffect above watches `status` and
        // navigates once the provider has hydrated the session + profile.
        // Navigating synchronously would race against `setStatus('authenticated')`
        // and bounce the user to /welcome (see RootRedirect in routes.tsx).
      } catch (err) {
        logEvent('auth_failure', 'warn', { op: 'sign_in' }, err);
        setErrors({ form: translateAuthError(err, t) });
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

  // In production without Supabase env, refuse to render the demo
  // login (otherwise the user "signs in" via setTimeout + navigate
  // with no Supabase session). In dev the demo path stays available.
  if (isMisconfiguredProduction(configured)) {
    return <ProductionConfigError />;
  }

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

          {/* Demo hint — DEMO MODE ONLY. Production users must never
              see demo credentials or a demo-fill affordance. */}
          {!configured && (
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
          )}

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

            <Button type="submit" size="lg" block loading={submitting}>
              {submitting ? t('auth.login.submitting') : t('auth.signIn')}
            </Button>

            {/* Nafath is a demo-only flow — it updates the demo store and
                does not touch Supabase. Hide it entirely in configured
                mode so a real user can't accidentally take a path that
                won't produce a Supabase session. */}
            {!configured && (
              <>
                <div className="flex items-center gap-3 text-[11px] text-ink-400">
                  <span className="h-px flex-1 bg-canvas-200" />
                  <span className="tracking-tight">{t('auth.login.or')}</span>
                  <span className="h-px flex-1 bg-canvas-200" />
                </div>
                <Link
                  to="/auth/nafath"
                  className={cn(
                    'flex items-center justify-center gap-2 h-13 w-full rounded-xl2 px-5',
                    'bg-white text-ink-900 ring-1 ring-inset ring-lavender-200',
                    'font-semibold text-[15px] tracking-tight select-none',
                    'hover:bg-lavender-50 active:bg-lavender-100',
                    'transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985]',
                    'focus:outline-none',
                  )}
                >
                  <ShieldIcon size={16} />
                  {t('auth.login.continueNafath')}
                </Link>
              </>
            )}

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
