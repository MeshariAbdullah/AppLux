import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

type Phase = 'idle' | 'verifying' | 'verified';

export default function Nafath() {
  const t = useT();
  const navigate = useNavigate();
  const { completeRegistration } = useStore();
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

  const onSkip = () => {
    completeRegistration(false);
    navigate('/auth/success', { replace: true });
  };

  return (
    <>
      <Header title={t('nafath.title')} showBack />
      <Screen padded={false} className="bg-gradient-to-b from-ink-50 to-white">
        <div className="px-4 pt-4 pb-8 space-y-5">
          <div className="relative overflow-hidden rounded-3xl bg-ink-900 text-white p-6 shadow-float">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-30"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-10%] h-48 w-48 rounded-full bg-brand-500/30 blur-3xl"
            />
            <div className="relative flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                <ShieldIcon size={12} />
                {t('nafath.pill')}
              </span>
              <span className="text-[11px] text-white/50">{t('nafath.optional')}</span>
            </div>
            <div className="relative mt-5">
              <div className="text-[12px] text-white/60">{t('nafath.codeLabel')}</div>
              <div className="mt-2 text-[56px] leading-none font-bold tracking-tight num">
                {String(code).padStart(2, '0')}
              </div>
              <div className="mt-4 flex gap-2">
                {options.map((n) => (
                  <span
                    key={n}
                    className={cn(
                      'h-10 w-10 grid place-items-center rounded-xl font-semibold num text-[15px]',
                      n === code
                        ? 'bg-white text-ink-900 ring-2 ring-gold-400'
                        : 'bg-white/10 text-white/70 ring-1 ring-white/10',
                    )}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl2 bg-white ring-1 ring-ink-100 p-4">
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-xl bg-ink-50 text-ink-700 grid place-items-center shrink-0">
                <ShieldIcon size={18} />
              </span>
              <div>
                <div className="text-[13.5px] font-semibold text-ink-900">
                  {t('nafath.title')}
                </div>
                <p className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
                  {t('nafath.instructions')}
                </p>
              </div>
            </div>
          </div>

          {phase === 'verified' ? (
            <div className="flex items-center justify-center gap-2 rounded-xl2 bg-success-50 ring-1 ring-success-500/20 text-success-600 py-3 text-[13px] font-semibold">
              <CheckIcon size={16} />
              {t('nafath.verified')}
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                size="lg"
                block
                loading={phase === 'verifying'}
                onClick={() => setPhase('verifying')}
              >
                {phase === 'verifying' ? t('nafath.verifying') : t('nafath.openApp')}
              </Button>
              <Button size="lg" variant="ghost" block onClick={onSkip} disabled={phase === 'verifying'}>
                {t('nafath.skipForNow')}
              </Button>
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}
