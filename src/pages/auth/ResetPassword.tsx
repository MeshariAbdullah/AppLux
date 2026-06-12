import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input } from '@/components/ui';
import { AlertIcon, BadgeCheckIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { updatePassword, useSupabaseAuth } from '@/lib/supabase';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';

/**
 * Reset-password page — the destination of the email link sent by
 * sendPasswordResetEmail. Supabase's `detectSessionInUrl: true` (set
 * on the client at client.ts) parses the recovery token from the URL
 * hash on mount and emits a PASSWORD_RECOVERY event on
 * onAuthStateChange. By the time React renders this page, the
 * provider's `session` is populated and `status === 'authenticated'`.
 *
 * If the user lands here without a valid recovery token (expired
 * link, opened in a different browser, manual URL), there's no
 * session — show the "link not valid" state and route them back to
 * /auth/forgot-password.
 */
export default function ResetPassword() {
  const t = useT();
  const navigate = useNavigate();
  const { configured, status, session } = useSupabaseAuth();
  const [pwd, setPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After a successful update, give the success screen a beat to
  // register, then hand off to RootRedirect ('/') which routes by
  // role.
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
    return () => window.clearTimeout(id);
  }, [done, navigate]);

  if (isMisconfiguredProduction(configured)) {
    return <ProductionConfigError />;
  }

  // Provider may still be hydrating — show nothing rather than
  // render the "invalid link" state before getSession resolves.
  if (configured && status === 'loading') {
    return null;
  }

  const recoverySessionPresent = configured && Boolean(session);

  if (done) {
    return (
      <>
        <Header title={t('auth.resetPassword.title')} />
        <Screen className="bg-canvas">
          <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-5 shadow-soft space-y-3 text-center">
            <div className="mx-auto h-11 w-11 rounded-2xl bg-success-50 text-success-600 grid place-items-center">
              <BadgeCheckIcon size={20} />
            </div>
            <h1 className="editorial-title text-[20px] text-ink-900 leading-tight">
              {t('auth.resetPassword.successTitle')}
            </h1>
            <p className="text-[13px] text-ink-500 leading-relaxed">
              {t('auth.resetPassword.successBody')}
            </p>
          </div>
        </Screen>
      </>
    );
  }

  if (!recoverySessionPresent) {
    return (
      <>
        <Header title={t('auth.resetPassword.title')} showBack />
        <Screen className="bg-canvas">
          <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-5 shadow-soft space-y-3">
            <div className="h-11 w-11 rounded-2xl bg-warn-50 text-warn-600 grid place-items-center">
              <AlertIcon size={20} />
            </div>
            <h1 className="editorial-title text-[20px] text-ink-900 leading-tight">
              {t('auth.resetPassword.invalidTitle')}
            </h1>
            <p className="text-[13px] text-ink-500 leading-relaxed">
              {t('auth.resetPassword.invalidBody')}
            </p>
          </div>
          <Link
            to="/auth/forgot-password"
            className="block text-center text-[13px] text-lavender-700 font-semibold pt-2"
          >
            {t('auth.resetPassword.tryAgain')}
          </Link>
        </Screen>
      </>
    );
  }

  const minOk = pwd.length >= 6;
  const matchOk = pwd === confirmPwd;
  const canSubmit = minOk && matchOk;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!minOk) {
      setError(t('auth.errors.passwordMinChars'));
      return;
    }
    if (!matchOk) {
      setError(t('auth.errors.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(pwd);
      setDone(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lend] updatePassword failed', err);
      setError(
        err instanceof Error ? err.message : t('auth.resetPassword.errorGeneric'),
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header title={t('auth.resetPassword.title')} />
      <Screen className="bg-canvas">
        <div>
          <h1 className="editorial-title text-[24px] text-ink-900 leading-tight">
            {t('auth.resetPassword.title')}
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">
            {t('auth.resetPassword.subtitle')}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField
            label={t('auth.resetPassword.newPasswordLabel')}
            required
            hint={t('auth.passwordHint')}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={pwd}
              onChange={(e) => {
                setPwd(e.target.value);
                if (error) setError(null);
              }}
              invalid={Boolean(error && !minOk)}
            />
          </FormField>

          <FormField
            label={t('auth.resetPassword.confirmPasswordLabel')}
            required
            error={error && !matchOk ? error : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPwd}
              onChange={(e) => {
                setConfirmPwd(e.target.value);
                if (error) setError(null);
              }}
              invalid={Boolean(error && !matchOk)}
            />
          </FormField>

          {error && matchOk && minOk && (
            <div
              role="alert"
              className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            block
            loading={submitting}
            disabled={submitting || !canSubmit}
          >
            {submitting
              ? t('auth.resetPassword.submitting')
              : t('auth.resetPassword.submit')}
          </Button>
        </form>
      </Screen>
    </>
  );
}
