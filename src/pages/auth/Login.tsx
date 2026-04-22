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

type FieldErrors = {
  mobile?: string;
  password?: string;
};

function isValidSaudiMobile(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return /^5\d{8}$/.test(digits);
}

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const { completeRegistration, updateDraft } = useStore();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const mobileError = useMemo(() => {
    if (!touched.mobile && !errors.mobile) return undefined;
    if (!mobile.trim()) return t('auth.errors.mobileRequired');
    if (!isValidSaudiMobile(mobile)) return t('auth.errors.mobileFormat');
    return undefined;
  }, [mobile, touched.mobile, errors.mobile, t]);

  const passwordError = useMemo(() => {
    if (!touched.password && !errors.password) return undefined;
    if (!password.trim()) return t('auth.errors.passwordRequired');
    if (password.length < 4) return t('auth.errors.passwordShort');
    return undefined;
  }, [password, touched.password, errors.password, t]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    setPassword('demo1234');
    setErrors({});
    setTouched({});
  };

  return (
    <>
      <Header title={t('auth.loginTitle')} showBack />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 shadow-float">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-15%] h-48 w-48 rounded-full bg-brand-500/25 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <ShieldIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2 py-0.5 text-[11px] font-semibold">
                  <BadgeCheckIcon size={12} />
                  {t('auth.login.trust')}
                </span>
                <h1 className="mt-2 text-[20px] font-bold leading-tight">
                  {t('auth.loginTitle')}
                </h1>
                <p className="mt-1.5 text-[12.5px] text-white/70 leading-relaxed">
                  {t('auth.loginSubtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Demo hint */}
          <div className="rounded-xl2 bg-brand-50/70 ring-1 ring-brand-100 p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-brand-600 grid place-items-center ring-1 ring-brand-100">
              <InfoIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12px] text-brand-900/90 leading-relaxed">
              <div className="font-semibold mb-0.5 text-brand-900 text-[12.5px]">
                {t('auth.login.demoTitle')}
              </div>
              <div>{t('auth.login.demoHint')}</div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline"
              >
                {t('auth.login.demoFill')}
              </button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={onSubmit} noValidate>
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
                className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700"
              >
                {t('auth.forgot')}
              </button>
            </div>

            <Button type="submit" size="lg" block loading={submitting}>
              {submitting ? t('auth.login.submitting') : t('auth.login')}
            </Button>

            <div className="flex items-center gap-2 text-[11.5px] text-ink-400">
              <span className="h-px flex-1 bg-ink-100" />
              {t('auth.login.or')}
              <span className="h-px flex-1 bg-ink-100" />
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

            <Card padded className="flex items-start gap-3 bg-white">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-success-50 text-success-600 grid place-items-center ring-1 ring-success-500/15">
                <LockIcon size={16} />
              </span>
              <div className="min-w-0 text-[12px] text-ink-600 leading-relaxed">
                <div className="text-ink-900 font-semibold mb-0.5 text-[12.5px]">
                  {t('auth.login.security.title')}
                </div>
                <div>{t('auth.login.security.hint')}</div>
              </div>
            </Card>

            <div className="text-center text-[13px] text-ink-500">
              {t('auth.noAccount')}{' '}
              <Link to="/auth/register" className="text-brand-600 font-semibold">
                {t('auth.register')}
              </Link>
            </div>
          </form>
        </div>
      </Screen>
    </>
  );
}
