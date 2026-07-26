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

  // Customer design language (C04/C10 family): centered green-halo
  // check on the beige canvas, navy CTA. Demo-only screen; behavior
  // unchanged.
  return (
    // Shell contract: every direct shell child is a bar or a
    // scroller. This full-bleed page scrolls itself; the inner
    // wrapper keeps min-h-full so short content still fills the
    // viewport (its background covers the safe areas too).
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar bg-beige-100">
      <div className="relative flex flex-col min-h-full bg-beige-100 text-navy-700">
      <div className="relative flex-1 flex flex-col items-center justify-center px-7 text-center">
        <span className="h-[84px] w-[84px] rounded-full bg-green-700 text-white grid place-items-center ring-[14px] ring-green-50">
          <CheckIcon size={34} strokeWidth={2.5} />
        </span>

        <h1 className="mt-7 text-[24px] font-bold leading-tight animate-slide-up">
          {t('success.title')}
        </h1>
        <p className="mt-3 text-[13.5px] leading-[1.9] text-ink-600 max-w-[32ch]">
          {t('success.subtitle')}
        </p>

        {session && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-beige-200 px-3.5 py-1.5 text-[12.5px] font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {session.fullName}
          </div>
        )}

        <BrandSlogan size="sm" className="mt-7" />
      </div>

      <div className="relative px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <Button
          size="lg"
          block
          className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
          onClick={() => navigate('/home', { replace: true })}
        >
          {t('success.continue')}
        </Button>
      </div>
      </div>
    </div>
  );
}
