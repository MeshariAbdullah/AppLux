import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  BadgeCheckIcon,
  BuildingIcon,
  ChartIcon,
  CheckIcon,
  WalletIcon,
} from '@/components/icons';
import { useT } from '@/lib/i18n';

export default function MerchantWelcome() {
  const t = useT();

  const features = [
    { icon: <BadgeCheckIcon size={18} />, label: t('merchant.entry.feature1') },
    { icon: <WalletIcon size={18} />, label: t('merchant.entry.feature2') },
    { icon: <ChartIcon size={18} />, label: t('merchant.entry.feature3') },
  ];

  return (
    <div className="relative flex flex-col min-h-full bg-gradient-to-b from-ink-900 via-ink-800 to-ink-700 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 pattern-dots opacity-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 end-[-20%] h-72 w-72 rounded-full bg-gold-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 start-[-15%] h-60 w-60 rounded-full bg-brand-500/20 blur-3xl"
      />

      <div className="relative flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white text-ink-900 grid place-items-center font-bold">
            A
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold tracking-wide">{t('app.name')}</span>
            <span className="mt-0.5 text-[10.5px] text-gold-300 uppercase tracking-wider">
              {t('merchant.entry.eyebrow')}
            </span>
          </div>
        </div>
        <LangToggle tone="light" />
      </div>

      <div className="relative flex-1 px-5 pt-12 pb-6 flex flex-col">
        <div className="mt-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/15 px-2.5 py-1 ring-1 ring-gold-400/30 text-[11.5px] font-semibold text-gold-200">
            <BuildingIcon size={13} />
            {t('merchant.entry.eyebrow')}
          </div>
          <h1 className="mt-4 text-[28px] leading-tight font-bold">
            {t('merchant.entry.title')}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/70 max-w-[34ch]">
            {t('merchant.entry.subtitle')}
          </p>
        </div>

        <ul className="mt-8 space-y-2.5">
          {features.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl2 bg-white/5 ring-1 ring-white/10 px-3.5 py-3 backdrop-blur"
            >
              <span className="h-9 w-9 grid place-items-center rounded-xl bg-white/10 text-white">
                {f.icon}
              </span>
              <span className="text-[13.5px] font-medium">{f.label}</span>
              <span className="ms-auto text-gold-400">
                <CheckIcon size={16} />
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 pt-10">
          <Link to="/merchant/register" className="block">
            <Button size="lg" block className="bg-white text-ink-900 hover:bg-white/90">
              {t('merchant.entry.register')}
            </Button>
          </Link>
          <Link to="/merchant/login" className="block">
            <Button size="lg" block variant="ghost" className="text-white hover:bg-white/10">
              {t('merchant.entry.login')}
            </Button>
          </Link>
          <Link
            to="/welcome"
            className="block text-center text-[12px] text-white/60 hover:text-white pt-1"
          >
            {t('merchant.entry.switchToUser')}
          </Link>
          <p className="text-center text-[11.5px] text-white/40 leading-relaxed px-6">
            {t('welcome.terms')}
          </p>
        </div>
      </div>
    </div>
  );
}
