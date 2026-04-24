import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { QrIcon, ShieldIcon, SparkleIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

type Phase = 'idle' | 'scanning' | 'matched';

export default function Scan() {
  const t = useT();
  const navigate = useNavigate();
  const { scans } = useStore();
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    if (phase !== 'scanning') return;
    const id = window.setTimeout(() => setPhase('matched'), 1600);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'matched') return;
    const id = window.setTimeout(() => {
      const token = scans[0]?.token;
      if (token) navigate(`/review/${token}`, { replace: true });
    }, 650);
    return () => window.clearTimeout(id);
  }, [phase, scans, navigate]);

  return (
    <>
      <Header title={t('qr.title')} showBack />
      <Screen padded={false} className="bg-ink-950">
        <div className="relative flex flex-col items-center px-4 pt-6 pb-8 text-white">
          <p className="text-center text-[13px] text-white/75 leading-relaxed max-w-xs">
            {t('qr.subtitle')}
          </p>

          {/* Camera frame */}
          <div className="mt-6 relative w-[260px] h-[260px] rounded-xl3 overflow-hidden bg-gradient-to-br from-ink-800 via-ink-900 to-black ring-1 ring-white/10 shadow-plush">
            <div aria-hidden className="absolute inset-0 pattern-dots opacity-20" />
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_65%)]" />

            {/* Mock QR */}
            <div
              className={cn(
                'absolute inset-0 grid place-items-center transition-opacity duration-300',
                phase === 'matched' ? 'opacity-100' : 'opacity-40',
              )}
            >
              <MockQr />
            </div>

            {/* Corner markers */}
            <Corners />

            {/* Scan line */}
            {phase === 'scanning' && (
              <div className="absolute inset-x-4 top-1/2 h-0.5 bg-gold-400 shadow-[0_0_14px_rgba(212,168,85,0.9)] animate-pulse" />
            )}

            {/* Matched overlay */}
            {phase === 'matched' && (
              <div className="absolute inset-0 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2.5">
                  <span className="h-12 w-12 rounded-full bg-gold-400 text-ink-950 grid place-items-center shadow-plush">
                    <SparkleIcon size={22} />
                  </span>
                  <span className="text-[13px] font-semibold tracking-tight">{t('qr.matched')}</span>
                </div>
              </div>
            )}
          </div>

          <p className="mt-5 text-[12.5px] text-white/60 text-center">
            {phase === 'scanning'
              ? t('qr.scanning')
              : phase === 'matched'
                ? t('qr.matched')
                : t('qr.frameHint')}
          </p>

          <div className="mt-6 w-full max-w-[320px] space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => setPhase('scanning')}
              disabled={phase !== 'idle'}
              leading={<QrIcon size={18} />}
            >
              {t('qr.simulate')}
            </Button>
            <Button
              variant="ghost"
              block
              className="text-white hover:bg-white/5"
              onClick={() => navigate(-1)}
            >
              {t('qr.cancel')}
            </Button>
          </div>

          <div className="mt-6 flex items-start gap-2 max-w-[320px] rounded-xl2 bg-white/5 ring-1 ring-white/10 px-3.5 py-3 text-[12px] text-white/70">
            <ShieldIcon size={16} className="mt-0.5 shrink-0 text-white/80" />
            <span className="leading-relaxed">{t('qr.permissionNote')}</span>
          </div>
        </div>
      </Screen>
    </>
  );
}

function Corners() {
  const base = 'absolute h-7 w-7 border-gold-400';
  return (
    <>
      <span className={cn(base, 'top-3 left-3 border-t-2 border-s-2 rounded-tl-xl')} />
      <span className={cn(base, 'top-3 right-3 border-t-2 border-e-2 rounded-tr-xl')} />
      <span className={cn(base, 'bottom-3 left-3 border-b-2 border-s-2 rounded-bl-xl')} />
      <span className={cn(base, 'bottom-3 right-3 border-b-2 border-e-2 rounded-br-xl')} />
    </>
  );
}

function MockQr() {
  // 9x9 pattern — deterministic and visually distinct
  const pattern = [
    '111111011',
    '100001010',
    '101110101',
    '101110100',
    '100001011',
    '111111010',
    '000000100',
    '011011011',
    '101011001',
  ];
  return (
    <div className="h-40 w-40 grid grid-cols-9 gap-0.5 p-2 bg-white rounded-xl shadow-inner">
      {pattern.flatMap((row, r) =>
        row.split('').map((v, c) => (
          <span
            key={`${r}-${c}`}
            className={cn('aspect-square rounded-[2px]', v === '1' ? 'bg-ink-900' : 'bg-transparent')}
          />
        )),
      )}
    </div>
  );
}
