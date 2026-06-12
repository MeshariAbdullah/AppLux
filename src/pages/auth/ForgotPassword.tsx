import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input } from '@/components/ui';
import { BadgeCheckIcon, ShieldIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { sendPasswordResetEmail, useSupabaseAuth } from '@/lib/supabase';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';

export default function ForgotPassword() {
  const t = useT();
  const { configured } = useSupabaseAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isMisconfiguredProduction(configured)) {
    return <ProductionConfigError />;
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!valid) {
      setError(t('auth.errors.emailFormat'));
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail({
        email: email.trim(),
        // The reset email link points back at our reset page on the
        // same origin so detectSessionInUrl can pick up the recovery
        // token. Using window.location.origin keeps this correct in
        // every deploy environment (Vercel / Netlify / local) with no
        // hard-coded URL.
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      setSent(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lend] sendPasswordResetEmail failed', err);
      setError(t('auth.forgotPassword.errorGeneric'));
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <>
        <Header title={t('auth.forgotPassword.title')} showBack />
        <Screen className="bg-canvas">
          <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-5 shadow-soft space-y-3 text-center">
            <div className="mx-auto h-11 w-11 rounded-2xl bg-success-50 text-success-600 grid place-items-center">
              <BadgeCheckIcon size={20} />
            </div>
            <h1 className="editorial-title text-[20px] text-ink-900 leading-tight">
              {t('auth.forgotPassword.successTitle')}
            </h1>
            <p className="text-[13px] text-ink-500 leading-relaxed">
              {t('auth.forgotPassword.successBody', { email: email.trim() })}
            </p>
          </div>
          <Link
            to="/auth/login"
            className="block text-center text-[13px] text-lavender-700 font-semibold pt-2"
          >
            {t('auth.forgotPassword.backToSignIn')}
          </Link>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Header title={t('auth.forgotPassword.title')} showBack />
      <Screen className="bg-canvas">
        <div>
          <h1 className="editorial-title text-[24px] text-ink-900 leading-tight">
            {t('auth.forgotPassword.title')}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">
            {t('auth.forgotPassword.subtitle')}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField
            label={t('auth.forgotPassword.emailLabel')}
            required
            error={error ?? undefined}
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPh')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              invalid={Boolean(error)}
            />
          </FormField>

          <Button
            type="submit"
            size="lg"
            block
            loading={submitting}
            disabled={submitting || !valid}
            leading={<ShieldIcon size={16} />}
          >
            {submitting
              ? t('auth.forgotPassword.sending')
              : t('auth.forgotPassword.send')}
          </Button>

          <div className="text-center text-[13px] text-ink-500 pt-1">
            <Link
              to="/auth/login"
              className="text-lavender-700 font-semibold hover:text-lavender-800"
            >
              {t('auth.forgotPassword.backToSignIn')}
            </Link>
          </div>
        </form>
      </Screen>
    </>
  );
}
