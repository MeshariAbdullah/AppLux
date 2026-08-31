import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheckIcon,
  CheckIcon,
  ShieldIcon,
  SparkleIcon,
} from '@/components/icons';
import { logEvent } from '@/lib/observability/log';
import { translateError, withSupportId } from '@/lib/errors';
import { useI18n, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useSensitiveFlow } from '@/lib/session/flowGuard';
import {
  recordNafathSigning,
  recordRentalPayment,
  useSupabaseAuth,
  verifyAndActivateRental,
} from '@/lib/supabase';

// =====================================================================
// PaymentSimulationSheet — temporary stand-in for the real payment +
// Nafath integration. Walks the customer through four animated states
// so the lifecycle can be completed end-to-end during testing:
//
//   1. pay     — fake card form; "Pay {amount}" → moves to nafath
//   2. nafath  — "Opening Nafath…" → "Verifying approval…"
//   3. verify  — short verification spinner
//   4. done    — success seal; on dismiss, routes to the active
//                rental tracking page (or the invoice page if no
//                contract id is available).
//
// The DB state is already advanced by accept_rental_invoice (RPC)
// BEFORE this sheet opens; the sheet is a purely visual walkthrough
// of the post-approval steps the real cycle will exercise once
// payment + Nafath APIs are wired.
// =====================================================================

type Phase = 'pay' | 'nafath' | 'verify' | 'done';

// =====================================================================
// Error helpers — detect the specific "function does not exist" case
// (code 42883) so the simulation can fall back to visual-only when the
// lifecycle migration (20260502121300_split_rental_lifecycle.sql)
// hasn't been applied yet. Backend state advancement is then skipped
// but the customer can still complete end-to-end testing. Raw error
// details go to logEvent (sanitized); the user sees a translated
// message with a support id.
// =====================================================================

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function readErr(err: unknown): SupabaseErrorLike {
  if (err && typeof err === 'object') return err as SupabaseErrorLike;
  return { message: String(err) };
}

function isFunctionMissing(err: unknown): boolean {
  const e = readErr(err);
  if (e.code === '42883') return true;
  return /function\s+[\w_.]+\s*\([^)]*\)\s+does not exist/i.test(
    e.message ?? '',
  );
}

export function PaymentSimulationSheet({
  open,
  onClose,
  amount,
  contractId,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  contractId: string | null;
  /** Fallback destination when contract id isn't available yet. */
  invoiceId?: string | null;
}) {
  const t = useT();
  const { dir, formatCurrency } = useI18n();
  const navigate = useNavigate();
  const { configured } = useSupabaseAuth();
  const [phase, setPhase] = useState<Phase>('pay');
  // Session hardening: the payment walkthrough drives the RPC chain
  // (record_rental_payment → record_nafath_signing →
  // verify_and_activate_rental) — never idle-logout while it's open
  // (see src/lib/session/flowGuard.ts).
  useSensitiveFlow(open);
  // Note id created by record_rental_payment in phase 'pay'.
  // Carried through phases 'nafath' (signing) and 'verify' (activation).
  const [noteId, setNoteId] = useState<string | null>(null);
  // Final contract id captured from verify_and_activate_rental so the
  // 'done' phase can route the customer to /track/contract/<id> even
  // if the contract id passed in as a prop was stale.
  const [activatedContractId, setActivatedContractId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the sheet re-opens.
  useEffect(() => {
    if (open) {
      setPhase('pay');
      setNoteId(null);
      setActivatedContractId(null);
      setError(null);
    }
  }, [open]);

  // Body scroll lock while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Phase transitions — each phase calls the next-step RPC and holds
  // for ~1.3s before advancing visually so the customer can read the
  // status. RPC failures stop the simulation with a visible error.
  useEffect(() => {
    if (!open) return;

    if (phase === 'nafath') {
      let cancelled = false;
      (async () => {
        try {
          if (configured && noteId) {
            await recordNafathSigning(noteId);
          }
        } catch (err) {
          if (cancelled) return;
          if (isFunctionMissing(err)) {
            // Migration not applied — continue visual-only.
            logEvent(
              'rpc_failure',
              'warn',
              { op: 'record_nafath_signing', detail: 'function_missing', visualOnly: true },
              err,
            );
          } else {
            const eventId = logEvent(
              'rpc_failure',
              'error',
              { op: 'record_nafath_signing' },
              err,
            );
            setError(withSupportId(translateError(err, t), eventId));
            return;
          }
        }
        if (cancelled) return;
        window.setTimeout(() => {
          if (!cancelled) setPhase('verify');
        }, 1300);
      })();
      return () => {
        cancelled = true;
      };
    }

    if (phase === 'verify') {
      let cancelled = false;
      (async () => {
        try {
          if (configured && noteId) {
            const cid = await verifyAndActivateRental(noteId);
            if (!cancelled) setActivatedContractId(cid);
          }
        } catch (err) {
          if (cancelled) return;
          if (isFunctionMissing(err)) {
            // Migration not applied — continue visual-only.
            logEvent(
              'rpc_failure',
              'warn',
              { op: 'verify_and_activate_rental', detail: 'function_missing', visualOnly: true },
              err,
            );
          } else {
            const eventId = logEvent(
              'rpc_failure',
              'error',
              { op: 'verify_and_activate_rental' },
              err,
            );
            setError(withSupportId(translateError(err, t), eventId));
            return;
          }
        }
        if (cancelled) return;
        window.setTimeout(() => {
          if (!cancelled) setPhase('done');
        }, 1300);
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [open, phase, configured, noteId, t]);

  const handlePay = async () => {
    setError(null);
    if (configured && invoiceId) {
      try {
        const id = await recordRentalPayment(invoiceId);
        setNoteId(id);
      } catch (err) {
        if (isFunctionMissing(err)) {
          // Most common cause: the lifecycle-split migration hasn't
          // been applied yet on this Supabase project. Continue the
          // simulation visually so the user can complete testing;
          // noteId stays null and the subsequent Nafath / verify
          // phases also fall through to visual-only.
          logEvent(
            'rpc_failure',
            'warn',
            { op: 'record_rental_payment', detail: 'function_missing', visualOnly: true },
            err,
          );
          setPhase('nafath');
          return;
        }
        const eventId = logEvent(
          'rpc_failure',
          'error',
          { op: 'record_rental_payment' },
          err,
        );
        setError(withSupportId(translateError(err, t), eventId));
        return;
      }
    }
    setPhase('nafath');
  };

  const handleFinish = () => {
    onClose();
    const target = activatedContractId ?? contractId;
    if (target) {
      navigate(`/track/contract/${target}`, { replace: true });
    } else if (invoiceId) {
      navigate(`/track/invoice/${invoiceId}`, { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('payment.simulation.title')}
    >
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={phase === 'pay' ? onClose : undefined}
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm animate-fade-in"
      />

      <div
        className={cn(
          // Width tracks the MobileShell tablet strategy.
          'relative w-full max-w-[480px] md:max-w-[600px] lg:max-w-[680px] bg-canvas-50 rounded-t-3xl shadow-plush',
          'ring-1 ring-canvas-200 animate-slide-up-soft',
          'flex flex-col max-h-[90vh]',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <span aria-hidden className="h-1 w-10 rounded-full bg-canvas-300" />
        </div>

        {/* Demo watermark — clear this is not a real payment */}
        <div className="px-5 pt-1 pb-2 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 ring-1 ring-warn-500/30 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-warn-700">
            {t('payment.simulation.demoPill')}
          </span>
        </div>

        <div className="px-6 pt-2 pb-6">
          {phase === 'pay' && (
            <PayStep
              amount={amount}
              onPay={handlePay}
              t={t}
              dir={dir}
              formatCurrency={formatCurrency}
            />
          )}
          {phase === 'nafath' && <NafathStep t={t} />}
          {phase === 'verify' && <VerifyStep t={t} />}
          {phase === 'done' && <DoneStep t={t} dir={dir} onContinue={handleFinish} />}

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

// =====================================================================
// Phase 1 — fake payment form
// =====================================================================

function PayStep({
  amount,
  onPay,
  t,
  dir,
  formatCurrency,
}: {
  amount: number;
  onPay: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
  formatCurrency: (n: number) => string;
}) {
  const [number, setNumber] = useState('4242 4242 4242 4242');
  const [exp, setExp] = useState('12/29');
  const [cvc, setCvc] = useState('123');
  return (
    <>
      <h2 className="editorial-title text-[20px] text-ink-900 leading-tight">
        {t('payment.simulation.pay.title')}
      </h2>
      <p className="mt-1.5 text-[12.5px] text-ink-500 leading-relaxed">
        {t('payment.simulation.pay.subtitle')}
      </p>

      <div className="mt-4 rounded-xl2 bg-white hairline shadow-soft p-4">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {t('payment.simulation.pay.amountLabel')}
        </div>
        <div className="mt-0.5 editorial-title text-[24px] text-ink-900 num">
          {formatCurrency(amount)}
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <label className="block">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {t('payment.simulation.pay.cardNumber')}
          </div>
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={cn(
              'mt-1 h-11 w-full rounded-xl2 bg-white ring-1 ring-canvas-200 px-3',
              'text-[14px] text-ink-900 font-medium num tracking-wider',
              'focus:outline-none focus:ring-2 focus:ring-lavender-300',
              dir === 'rtl' ? 'text-right' : 'text-left',
            )}
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t('payment.simulation.pay.expiry')}
            </div>
            <input
              type="text"
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              className={cn(
                'mt-1 h-11 w-full rounded-xl2 bg-white ring-1 ring-canvas-200 px-3',
                'text-[14px] text-ink-900 font-medium num',
                'focus:outline-none focus:ring-2 focus:ring-lavender-300',
                dir === 'rtl' ? 'text-right' : 'text-left',
              )}
            />
          </label>
          <label className="block">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t('payment.simulation.pay.cvc')}
            </div>
            <input
              type="text"
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              className={cn(
                'mt-1 h-11 w-full rounded-xl2 bg-white ring-1 ring-canvas-200 px-3',
                'text-[14px] text-ink-900 font-medium num',
                'focus:outline-none focus:ring-2 focus:ring-lavender-300',
                dir === 'rtl' ? 'text-right' : 'text-left',
              )}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={onPay}
        className={cn(
          'mt-5 inline-flex items-center justify-center gap-2 h-13 w-full rounded-xl2',
          'bg-ink-900 text-white font-semibold text-[15px] tracking-tight',
          'shadow-plush hover:bg-ink-800 active:bg-ink-800 transition-colors',
        )}
      >
        <SparkleIcon size={16} />
        {t('payment.simulation.pay.cta', { amount: formatCurrency(amount) })}
      </button>

      <p className="mt-3 text-center text-[11px] text-ink-400 leading-relaxed">
        {t('payment.simulation.pay.footnote')}
      </p>
    </>
  );
}

// =====================================================================
// Phase 2 — Nafath redirect simulation
// =====================================================================

function NafathStep({ t }: { t: (k: string) => string }) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-lavender-100 text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
        <ShieldIcon size={28} />
      </div>
      <h2 className="mt-5 editorial-title text-[18px] text-ink-900 leading-tight">
        {t('payment.simulation.nafath.title')}
      </h2>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed max-w-xs mx-auto">
        {t('payment.simulation.nafath.body')}
      </p>
      <div className="mt-5 inline-flex items-center gap-2 text-[11.5px] text-lavender-700">
        <span className="h-3 w-3 rounded-full border-2 border-lavender-600 border-t-transparent animate-spin" />
        {t('payment.simulation.nafath.hint')}
      </div>
    </div>
  );
}

// =====================================================================
// Phase 3 — verification spinner
// =====================================================================

function VerifyStep({ t }: { t: (k: string) => string }) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center hairline">
        <BadgeCheckIcon size={28} />
      </div>
      <h2 className="mt-5 editorial-title text-[18px] text-ink-900 leading-tight">
        {t('payment.simulation.verify.title')}
      </h2>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed max-w-xs mx-auto">
        {t('payment.simulation.verify.body')}
      </p>
      <div className="mt-5 inline-flex items-center gap-2 text-[11.5px] text-ink-500">
        <span className="h-3 w-3 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
        {t('payment.simulation.verify.hint')}
      </div>
    </div>
  );
}

// =====================================================================
// Phase 4 — success
// =====================================================================

function DoneStep({
  t,
  dir,
  onContinue,
}: {
  t: (k: string) => string;
  dir: 'rtl' | 'ltr';
  onContinue: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="mx-auto h-16 w-16 rounded-full bg-lavender-400 text-white grid place-items-center shadow-plush animate-stamp-in">
        <CheckIcon size={32} strokeWidth={3} />
      </div>
      <h2 className="mt-5 editorial-title text-[20px] text-ink-900 leading-tight animate-reveal-up">
        {t('payment.simulation.done.title')}
      </h2>
      <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed max-w-xs mx-auto animate-reveal-up">
        {t('payment.simulation.done.body')}
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
        {t('payment.simulation.done.cta')}
        <span className={cn(dir === 'rtl' ? '-scale-x-100' : '')}>→</span>
      </button>
    </div>
  );
}
