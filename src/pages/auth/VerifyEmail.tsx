import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Screen } from '@/components/layout';
import { Button, FormField, Input } from '@/components/ui';
import { ArrowIcon, MailIcon } from '@/components/icons';
import { translateAuthError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useT } from '@/lib/i18n';
import {
  resendSignupConfirmation,
  signOut,
  useSupabaseAuth,
  verifyEmailOtp,
} from '@/lib/supabase';
import { normalizeDigits } from '@/lib/validation/customer';

// =====================================================================
// Email OTP verification (Bug 2, part B). The customer lands here
// straight after signup (session is null while the email is
// unconfirmed) or when the unverified-email route guard bounces an
// authenticated-but-unconfirmed customer out of operational routes.
//
// Verification is REAL Supabase Auth: auth.verifyOtp({type:'email'})
// against the numeric code from the confirmation email (template must
// render {{ .Token }}). On success GoTrue marks the email confirmed
// and returns a session; the status effect below hands off to '/'
// exactly like Login/Register do. Nothing is faked or bypassed; the
// OTP is never persisted app-side and neither email nor code is ever
// logged.
//
// The email travels via router state and a sessionStorage anchor (so
// a mid-flow refresh keeps working), falling back to the signed-in
// user's email for the guard-redirect case.
// =====================================================================

const EMAIL_ANCHOR_KEY = 'lend.verifyEmail';
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmail() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { configured, status, session } = useSupabaseAuth();

  const stateEmail = (location.state as { email?: string } | null)?.email;
  const email = useMemo(() => {
    if (stateEmail) return stateEmail;
    const stored = sessionStorage.getItem(EMAIL_ANCHOR_KEY);
    if (stored) return stored;
    return session?.user?.email ?? '';
  }, [stateEmail, session?.user?.email]);

  useEffect(() => {
    if (stateEmail) sessionStorage.setItem(EMAIL_ANCHOR_KEY, stateEmail);
  }, [stateEmail]);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentNote, setResentNote] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<number | null>(null);

  // Verified session hydrated (either from a successful verifyOtp or
  // because an already-verified user opened this page) → hand off to
  // RootRedirect. The guard only sends UNverified sessions here, so an
  // authenticated status with a confirmed email means we're done.
  const emailConfirmed = Boolean(
    session?.user?.email_confirmed_at ?? session?.user?.confirmed_at,
  );
  useEffect(() => {
    if (configured && status === 'authenticated' && emailConfirmed) {
      sessionStorage.removeItem(EMAIL_ANCHOR_KEY);
      navigate('/', { replace: true });
    }
  }, [configured, status, emailConfirmed, navigate]);

  // No email context at all — nothing to verify against; restart at
  // the registration screen.
  useEffect(() => {
    if (configured && !email) navigate('/auth/register', { replace: true });
  }, [configured, email, navigate]);

  useEffect(
    () => () => {
      if (cooldownTimer.current) window.clearInterval(cooldownTimer.current);
    },
    [],
  );

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_S);
    cooldownTimer.current = window.setInterval(() => {
      setCooldown((s) => {
        if (s <= 1 && cooldownTimer.current) {
          window.clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
        }
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    const token = normalizeDigits(code.trim());
    if (!/^\d{6}$/.test(token)) {
      setError(t('auth.verifyEmail.codeFormat'));
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      await verifyEmailOtp({ email, token });
      // Session propagates via onAuthStateChange → the status effect
      // above navigates. Nothing else to do here.
    } catch (err) {
      // Op name only — no email, no OTP, no payload (Bug 2 rule 12).
      logEvent('auth_failure', 'warn', { op: 'verify_email_otp' }, err);
      setError(translateAuthError(err, t));
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setResentNote(false);
    try {
      await resendSignupConfirmation(email);
      setResentNote(true);
      startCooldown();
    } catch (err) {
      logEvent('auth_failure', 'warn', { op: 'resend_email_otp' }, err);
      setError(translateAuthError(err, t));
    } finally {
      setResending(false);
    }
  };

  const onChangeEmail = async () => {
    // Safe pre-verification: drop any (unverified) session and return
    // to registration so a mistyped address can be corrected.
    sessionStorage.removeItem(EMAIL_ANCHOR_KEY);
    if (session) await signOut();
    navigate('/auth/register', { replace: true });
  };

  return (
    <Screen padded={false} className="bg-beige-100">
      <div className="px-6 pt-[calc(env(safe-area-inset-top)+72px)] pb-10 flex flex-col items-center text-center">
        <span className="h-[76px] w-[76px] rounded-full bg-green-50 text-green-700 grid place-items-center">
          <MailIcon size={28} />
        </span>
        <h1 className="mt-6 text-[21px] font-bold text-navy-700">
          {t('auth.verifyEmail.title')}
        </h1>
        <p className="mt-2 text-[13px] text-ink-600 leading-[1.9] max-w-[300px]">
          {t('auth.verifyEmail.subtitle')}{' '}
          <span className="font-bold text-ink-900 break-all" dir="ltr">
            {email}
          </span>
        </p>

        <form className="mt-7 w-full max-w-[320px] space-y-4" onSubmit={onVerify} noValidate>
          <FormField label={t('auth.verifyEmail.codeLabel')} error={error ?? undefined}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              className="num text-center tracking-[0.4em] text-[18px]"
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(normalizeDigits(e.target.value).replace(/\D/g, ''));
                if (error) setError(null);
              }}
              invalid={Boolean(error)}
            />
          </FormField>

          {resentNote && (
            <div
              className="rounded-xl2 bg-green-50 ring-1 ring-green-200 px-3.5 py-2.5 text-[12.5px] text-green-700 leading-relaxed"
              aria-live="polite"
            >
              {t('auth.verifyEmail.resent')}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            block
            loading={verifying}
            disabled={verifying || code.length < 6}
            className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
          >
            {t('auth.verifyEmail.verifyCta')}
          </Button>

          <button
            type="button"
            onClick={() => void onResend()}
            disabled={cooldown > 0 || resending}
            className="w-full text-[13px] font-bold text-green-700 hover:text-green-800 disabled:text-ink-400 disabled:cursor-not-allowed"
          >
            {cooldown > 0
              ? t('auth.verifyEmail.resendIn', { s: cooldown })
              : t('auth.verifyEmail.resendCta')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void onChangeEmail()}
          className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] text-ink-500 hover:text-ink-700"
        >
          <ArrowIcon size={12} className="rtl:rotate-0 ltr:rotate-180" />
          {t('auth.verifyEmail.changeEmail')}
        </button>

        <Link
          to="/auth/login"
          className="mt-3 text-[12.5px] text-ink-400 hover:text-ink-600"
        >
          {t('auth.verifyEmail.backToLogin')}
        </Link>
      </div>
    </Screen>
  );
}
