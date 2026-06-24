import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheckIcon,
  CheckIcon,
  ShieldIcon,
} from '@/components/icons';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { recordIdentityVerification, useSupabaseAuth } from '@/lib/supabase';

// =====================================================================
// IdentityVerificationSheet — bottom sheet that completes the renter's
// one-time Nafath identity check before the legal commitment step
// (accepting a rental + signing the promissory note).
//
// The renter does NOT type any government identity data inside Lend.
// This is a simulation of the official Nafath ceremony for testing:
//
//   1. connect — "Opening Nafath…" with the demo code
//   2. verify  — short spinner while we record the verification
//                via record_identity_verification RPC
//   3. done    — success seal; "Continue" calls onVerified() so the
//                page can retry the action that triggered the gate
//
// In demo (un-configured) mode the RPC call is skipped — the sheet
// completes visually only, so the rest of the demo can still flow.
// =====================================================================

type Phase = 'connect' | 'verify' | 'done';

type SupabaseErrorLike = { message?: string; code?: string };

function readErr(err: unknown): SupabaseErrorLike {
  if (err && typeof err === 'object') return err as SupabaseErrorLike;
  return { message: String(err) };
}

export function IdentityVerificationSheet({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const t = useT();
  const { configured } = useSupabaseAuth();
  const [phase, setPhase] = useState<Phase>('connect');
  const [error, setError] = useState<string | null>(null);

  // The 2-digit code shown in the sheet — stable for the lifetime of
  // one open. Re-derives whenever the sheet is reopened.
  const code = useMemo(() => Math.floor(10 + Math.random() * 90), [open]);

  useEffect(() => {
    if (open) {
      setPhase('connect');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // connect → verify after a short "Opening Nafath" beat.
  useEffect(() => {
    if (!open || phase !== 'connect') return;
    const id = window.setTimeout(() => setPhase('verify'), 1400);
    return () => window.clearTimeout(id);
  }, [open, phase]);

  // verify — call the RPC, then move to 'done' (or surface the error).
  useEffect(() => {
    if (!open || phase !== 'verify') return;
    let cancelled = false;
    (async () => {
      try {
        if (configured) {
          await recordIdentityVerification({
            provider: 'simulation',
            referenceId: `SIM-${code.toString().padStart(2, '0')}-${Math.floor(
              100000 + Math.random() * 899999,
            )}`,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const e = readErr(err);
        // eslint-disable-next-line no-console
        console.error('[lend] recordIdentityVerification failed', err);
        setError(e.message ?? t('identity.error'));
        return;
      }
      if (cancelled) return;
      window.setTimeout(() => {
        if (!cancelled) setPhase('done');
      }, 900);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, phase, configured, code, t]);

  const handleContinue = () => {
    onClose();
    onVerified();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('identity.required.title')}
    >
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={phase === 'connect' ? onClose : undefined}
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm animate-fade-in"
      />

      <div
        className={cn(
          'relative w-full max-w-[480px] bg-canvas-50 rounded-t-3xl shadow-plush',
          'ring-1 ring-canvas-200 animate-slide-up-soft',
          'flex flex-col max-h-[90vh]',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="pt-2.5 pb-1 flex justify-center">
          <span aria-hidden className="h-1 w-10 rounded-full bg-canvas-300" />
        </div>

        <div className="px-5 pt-1 pb-2 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 ring-1 ring-warn-500/30 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-warn-700">
            {t('identity.simulationPill')}
          </span>
        </div>

        <div className="px-6 pt-2 pb-6">
          {phase === 'connect' && <ConnectStep t={t} code={code} />}
          {phase === 'verify' && <VerifyStep t={t} />}
          {phase === 'done' && <DoneStep t={t} onContinue={handleContinue} />}

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed"
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectStep({
  t,
  code,
}: {
  t: (k: string) => string;
  code: number;
}) {
  return (
    <div className="text-center py-3">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-lavender-100 text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
        <ShieldIcon size={28} />
      </div>
      <h2 className="mt-5 editorial-title text-[20px] text-ink-900 leading-tight">
        {t('identity.verifying.title')}
      </h2>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed max-w-xs mx-auto">
        {t('identity.verifying.body')}
      </p>

      <div className="mt-5 rounded-xl3 bg-ink-900 text-white p-5 mx-auto max-w-xs">
        <div className="text-[10.5px] text-white/55 uppercase tracking-[0.12em]">
          {t('identity.verifying.codeLabel')}
        </div>
        <div className="mt-2 editorial-title text-[44px] leading-none num text-white">
          {String(code).padStart(2, '0')}
        </div>
      </div>

      <div className="mt-5 inline-flex items-center gap-2 text-[11.5px] text-lavender-700">
        <span className="h-3 w-3 rounded-full border-2 border-lavender-600 border-t-transparent animate-spin" />
        {t('identity.verifying.hint')}
      </div>
    </div>
  );
}

function VerifyStep({ t }: { t: (k: string) => string }) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center hairline">
        <BadgeCheckIcon size={28} />
      </div>
      <h2 className="mt-5 editorial-title text-[18px] text-ink-900 leading-tight">
        {t('identity.recording.title')}
      </h2>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed max-w-xs mx-auto">
        {t('identity.recording.body')}
      </p>
      <div className="mt-5 inline-flex items-center gap-2 text-[11.5px] text-ink-500">
        <span className="h-3 w-3 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
        {t('identity.recording.hint')}
      </div>
    </div>
  );
}

function DoneStep({
  t,
  onContinue,
}: {
  t: (k: string) => string;
  onContinue: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="mx-auto h-16 w-16 rounded-full bg-lavender-400 text-white grid place-items-center shadow-plush animate-stamp-in">
        <CheckIcon size={32} strokeWidth={3} />
      </div>
      <h2 className="mt-5 editorial-title text-[20px] text-ink-900 leading-tight animate-reveal-up">
        {t('identity.verified.title')}
      </h2>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed max-w-xs mx-auto animate-reveal-up">
        {t('identity.verified.body')}
      </p>
      <button
        type="button"
        onClick={onContinue}
        className={cn(
          'mt-5 inline-flex items-center justify-center gap-2 h-12 w-full rounded-xl2',
          'bg-ink-900 text-white font-semibold text-[14px] tracking-tight',
          'shadow-plush hover:bg-ink-800 active:bg-ink-800 transition-colors',
        )}
      >
        {t('identity.verified.continue')}
      </button>
    </div>
  );
}
