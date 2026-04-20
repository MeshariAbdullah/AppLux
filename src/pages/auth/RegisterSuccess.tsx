import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { CheckIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function RegisterSuccess() {
  const t = useT();
  const navigate = useNavigate();
  const { session } = useStore();

  useEffect(() => {
    if (!session) navigate('/welcome', { replace: true });
  }, [session, navigate]);

  return (
    <div className="relative flex flex-col min-h-full bg-gradient-to-b from-ink-900 via-ink-800 to-ink-900 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-30" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-10 start-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-success-500/25 blur-3xl"
      />

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="relative">
          <span className="absolute inset-0 rounded-full animate-pulse-ring" />
          <span className="relative h-20 w-20 grid place-items-center rounded-full bg-success-500 text-white shadow-float">
            <CheckIcon size={36} strokeWidth={2.4} />
          </span>
        </div>

        <h1 className="mt-7 text-[24px] font-bold animate-slide-up">{t('success.title')}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-white/70 max-w-[34ch]">
          {t('success.subtitle')}
        </p>

        {session && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1.5 text-[12.5px]">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            {session.fullName}
          </div>
        )}
      </div>

      <div className="relative px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <Button
          size="lg"
          block
          className="bg-white text-ink-900 hover:bg-white/90"
          onClick={() => navigate('/home', { replace: true })}
        >
          {t('success.continue')}
        </Button>
      </div>
    </div>
  );
}
