import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function MerchantLogin() {
  const t = useT();
  const navigate = useNavigate();
  const { updateMerchantDraft, submitMerchantApproval, approveMerchant } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError(t('merchant.register.errors.required'));
      return;
    }
    setSubmitting(true);
    // Demo login: pre-fill a demo merchant and mark as approved.
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

  return (
    <>
      <Header title={t('merchant.login.title')} showBack />
      <Screen>
        <div className="pt-1">
          <h1 className="text-[22px] font-bold text-ink-900">{t('merchant.login.title')}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-500 leading-relaxed">
            {t('merchant.login.subtitle')}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField label={t('merchant.login.email')} required>
            <Input
              type="email"
              placeholder={t('merchant.login.emailPh')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={Boolean(error && !email)}
              autoComplete="email"
            />
          </FormField>
          <FormField label={t('merchant.login.password')} required>
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
            {t('merchant.login.submit')}
          </Button>

          <div className="text-center text-[13px] text-ink-500">
            {t('merchant.login.noAccount')}{' '}
            <Link to="/merchant/register" className="text-brand-600 font-semibold">
              {t('merchant.login.register')}
            </Link>
          </div>
        </form>
      </Screen>
    </>
  );
}
