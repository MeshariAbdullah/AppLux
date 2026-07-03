import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { CheckIcon } from '@/components/icons';
import { BrandSlogan } from '@/components/brand/BrandSlogan';
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
    <div className="relative flex flex-col min-h-full bg-gradient-to-b from-ink-950 via-ink-900 to-ink-800 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-16 start-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-gold-400/20 blur-[110px]"
      />

      <div className="relative flex-1 flex flex-col items-center justify-center px-7 text-center">
        <div className="relative">
          <span className="absolute inset-0 rounded-full animate-pulse-ring" />
          <span className="relative h-20 w-20 grid place-items-center rounded-full bg-gold-400 text-ink-950 shadow-plush">
            <CheckIcon size={36} strokeWidth={2.4} />
          </span>
        </div>

        <h1 className="mt-8 editorial-title text-[28px] leading-tight animate-slide-up">
          {t('success.title')}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-white/65 max-w-[34ch]">
          {t('success.subtitle')}
        </p>

        {session && (
          <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1.5 text-[12.5px]">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
            {session.fullName}
          </div>
        )}

        <BrandSlogan size="sm" tone="dark" className="mt-8" />
      </div>

      <div className="relative px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <Button
          size="lg"
          block
          className="bg-white text-ink-950 hover:bg-white/95 shadow-plush"
          onClick={() => navigate('/home', { replace: true })}
        >
          {t('success.continue')}
        </Button>
      </div>
    </div>
  );
}
