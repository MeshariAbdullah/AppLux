import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const { completeRegistration, updateDraft } = useStore();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mobile.trim() || !password.trim()) {
      setError(t('register.errors.required'));
      return;
    }
    setSubmitting(true);
    updateDraft({ fullName: 'Demo User', mobile, email: '', city: '', address: '', profession: '', employer: '', income: '', nationalId: '', dob: '' });
    window.setTimeout(() => {
      completeRegistration(true);
      navigate('/home', { replace: true });
    }, 700);
  };

  return (
    <>
      <Header title={t('auth.loginTitle')} showBack />
      <Screen>
        <div className="pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">{t('auth.loginTitle')}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-500 leading-relaxed">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField label={t('auth.mobile')} required>
            <Input
              inputMode="tel"
              placeholder="5XXXXXXXX"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              leading={
                <span className="text-ink-500 text-[13px] font-medium num">+966</span>
              }
              invalid={Boolean(error && !mobile)}
            />
          </FormField>
          <FormField label={t('auth.password')} required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={Boolean(error && !password)}
              autoComplete="current-password"
            />
          </FormField>

          {error && <div className="text-[12px] text-danger-600">{error}</div>}

          <div className="flex justify-end">
            <button type="button" className="text-[12.5px] font-medium text-brand-600">
              {t('auth.forgot')}
            </button>
          </div>

          <Button type="submit" size="lg" block loading={submitting}>
            {t('auth.login')}
          </Button>

          <div className="text-center text-[13px] text-ink-500">
            {t('auth.noAccount')}{' '}
            <Link to="/auth/register" className="text-brand-600 font-semibold">
              {t('auth.register')}
            </Link>
          </div>
        </form>
      </Screen>
    </>
  );
}
