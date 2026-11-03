import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { AlertIcon, BadgeCheckIcon } from '@/components/icons';
import { logEvent } from '@/lib/observability/log';
import { useT } from '@/lib/i18n';
import { confirmEmailLinkToken } from '@/lib/supabase/auth';
import { recordLinkKind } from '@/lib/supabase/authLink';
import { useSupabaseAuth } from '@/lib/supabase';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';

/**
 * /auth/confirm — the landing page for invite and password-recovery
 * EMAILS (templates link here with `?token_hash=…&type=invite|recovery`
 * instead of Supabase's /auth/v1/verify endpoint).
 *
 * Why this page exists: corporate mail scanners (Microsoft Outlook /
 * Safe Links in particular) GET every link in an email before the
 * person opens it. Supabase's verify endpoint consumes its single-use
 * token on that GET, so by the time the human clicks, the link is
 * already spent and they see "invalid link". Here the GET renders
 * plain HTML and consumes NOTHING — the token hash is exchanged for a
 * session (auth.verifyOtp) only when the person presses the continue
 * button. This is the flow Supabase's docs recommend for exactly this
 * problem.
 *
 * Token hygiene: the query string is captured once on mount and
 * immediately stripped from the address bar (history.replaceState), so
 * the hash never lingers in the URL, browser history, or anything that
 * reads location. It is never logged.
 */
export default function ConfirmLink() {
  const t = useT();
  const navigate = useNavigate();
  const { configured } = useSupabaseAuth();

  // Captured synchronously on first render, then scrubbed from the URL.
  const [params] = useState<{ tokenHash: string; type: 'invite' | 'recovery' | null }>(() => {
    const search = new URLSearchParams(window.location.search);
    const tokenHash = search.get('token_hash') ?? '';
    const rawType = search.get('type') ?? '';
    const type = rawType === 'invite' || rawType === 'recovery' ? rawType : null;
    return { tokenHash, type };
  });
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Scrub the token from the address bar before anything else runs.
    try {
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch {
      /* history API unavailable — the page still works */
    }
  }, []);

  if (isMisconfiguredProduction(configured)) {
    return <ProductionConfigError />;
  }

  const usable = configured && params.type !== null && params.tokenHash.length > 0;
  const isInvite = params.type === 'invite';

  if (!usable || failed) {
    return (
      <>
        <Header title={t('auth.confirmLink.title')} showBack />
        <Screen width="narrow" className="bg-canvas">
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

  const onContinue = async () => {
    if (!params.type) return;
    setWorking(true);
    try {
      await confirmEmailLinkToken({ tokenHash: params.tokenHash, type: params.type });
      recordLinkKind(params.type);
      navigate('/auth/reset-password', { replace: true });
    } catch (err) {
      // Expired / already-used token, or network failure. The token
      // hash itself is deliberately NOT part of the logged context.
      logEvent('auth_failure', 'warn', { op: 'confirm_email_link', kind: params.type }, err);
      setFailed(true);
    }
  };

  return (
    <>
      <Header title={t('auth.confirmLink.title')} />
      <Screen width="narrow" className="bg-canvas">
        <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-5 shadow-soft space-y-3 text-center">
          <div className="mx-auto h-11 w-11 rounded-2xl bg-lavender-50 text-lavender-700 grid place-items-center">
            <BadgeCheckIcon size={20} />
          </div>
          <h1 className="editorial-title text-[20px] text-ink-900 leading-tight">
            {t(isInvite ? 'auth.confirmLink.inviteHeadline' : 'auth.confirmLink.recoveryHeadline')}
          </h1>
          <p className="text-[13px] text-ink-500 leading-relaxed">
            {t(isInvite ? 'auth.confirmLink.inviteBody' : 'auth.confirmLink.recoveryBody')}
          </p>
        </div>
        <Button block size="lg" loading={working} onClick={onContinue}>
          {t('auth.confirmLink.continue')}
        </Button>
        <p className="text-center text-[11.5px] text-ink-400 leading-relaxed px-4">
          {t('auth.confirmLink.hint')}
        </p>
      </Screen>
    </>
  );
}
