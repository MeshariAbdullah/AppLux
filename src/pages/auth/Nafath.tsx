import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';
import { cn } from '@/lib/cn';

type Phase = 'idle' | 'verifying' | 'verified';

export default function Nafath() {
  const t = useT();
  const navigate = useNavigate();
  const { completeRegistration } = useStore();
  const { configured } = useSupabaseAuth();
  const [phase, setPhase] = useState<Phase>('idle');

  const code = useMemo(() => Math.floor(10 + Math.random() * 90), []);
  const options = useMemo(() => {
    const s = new Set<number>([code]);
    while (s.size < 3) s.add(Math.floor(10 + Math.random() * 90));
    return [...s].sort(() => Math.random() - 0.5);
  }, [code]);

  useEffect(() => {
    if (phase !== 'verifying') return;
    const id = window.setTimeout(() => setPhase('verified'), 1800);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'verified') return;
    const id = window.setTimeout(() => {
      completeRegistration(true);
      navigate('/auth/success', { replace: true });
    }, 900);
    return () => window.clearTimeout(id);
  }, [phase, completeRegistration, navigate]);

  // Auth Hardening Phase 1: this simulated Nafath screen drives the
  // DEMO registration store (completeRegistration fabricates a demo
  // session). In a live Supabase build it must never run — a direct
  // visit to /auth/nafath is bounced to the real sign-in entry. Demo
  // behavior is unchanged. (Placed after every hook — the idle-phase
  // effects above are no-ops when this returns.)
  if (configured) {
    return <Navigate to="/auth/login" replace />;
  }

  const onSkip = () => {
    completeRegistration(false);
    navigate('/auth/success', { replace: true });
  };

  return (
    <>
      <Header title={t('nafath.title')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-15%] h-52 w-52 rounded-full bg-gold-400/22 blur-[80px]"
            />
            <div className="relative flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold">
                <ShieldIcon size={12} />
                {t('nafath.pill')}
              </span>
              <span className="text-[11px] text-white/55">{t('nafath.optional')}</span>
            </div>
            <div className="relative mt-6">
              <div className="text-[11.5px] text-white/55 uppercase tracking-[0.08em]">
                {t('nafath.codeLabel')}
              </div>
              <div className="mt-3 editorial-title text-[64px] leading-none num text-white">
                {String(code).padStart(2, '0')}
              </div>
              <div className="mt-5 flex gap-2.5">
                {options.map((n) => (
                  <span
                    key={n}
                    className={cn(
                      'h-11 w-11 grid place-items-center rounded-2xl font-semibold num text-[15px]',
                      n === code
                        ? 'bg-gold-400 text-ink-950 shadow-soft'
                        : 'bg-white/8 text-white/70 ring-1 ring-white/10',
                    )}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <Card padded className="flex items-start gap-3.5">
            <span className="h-10 w-10 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center shrink-0">
              <ShieldIcon size={18} />
            </span>
            <div>
              <div className="text-[14px] font-semibold text-ink-900 tracking-tight">
                {t('nafath.title')}
              </div>
              <p className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
                {t('nafath.instructions')}
              </p>
            </div>
          </Card>

          {phase === 'verified' ? (
            <div className="flex items-center justify-center gap-2 rounded-xl2 bg-gold-50 text-gold-700 py-3.5 text-[13.5px] font-semibold tracking-tight">
              <CheckIcon size={16} />
              {t('nafath.verified')}
            </div>
          ) : (
            <div className="space-y-2.5">
              <Button
                size="lg"
                block
                loading={phase === 'verifying'}
                onClick={() => setPhase('verifying')}
              >
                {phase === 'verifying' ? t('nafath.verifying') : t('nafath.openApp')}
              </Button>
              <Button
                size="lg"
                variant="ghost"
                block
                onClick={onSkip}
                disabled={phase === 'verifying'}
              >
                {t('nafath.skipForNow')}
              </Button>
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}
