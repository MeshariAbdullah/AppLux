import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  ChartIcon,
  CheckIcon,
  ShieldIcon,
  WalletIcon,
} from '@/components/icons';
import { useT } from '@/lib/i18n';

export default function Welcome() {
  const t = useT();

  const features = [
    { icon: <ShieldIcon size={16} />, label: t('welcome.feature1') },
    { icon: <WalletIcon size={16} />, label: t('welcome.feature2') },
    { icon: <ChartIcon size={16} />, label: t('welcome.feature3') },
  ];

  return (
    <div className="relative flex flex-col min-h-full bg-gradient-to-b from-ink-950 via-ink-900 to-ink-800 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 end-[-25%] h-80 w-80 rounded-full bg-gold-400/22 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 start-[-20%] h-72 w-72 rounded-full bg-gold-500/12 blur-[110px]"
      />

      <div className="relative flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+22px)]">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-white text-ink-900 grid place-items-center editorial-title text-[16px]">
            A
          </div>
          <span className="font-semibold tracking-tight text-[14px]">
            {t('welcome.eyebrow')}
          </span>
        </div>
        <LangToggle tone="light" />
      </div>

      <div className="relative flex-1 px-6 pt-16 pb-8 flex flex-col">
        <div className="mt-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 ring-1 ring-white/12 text-[11px] font-medium text-white/85">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-300 animate-pulse" />
            {t('app.tagline')}
          </div>
          <h1 className="mt-6 editorial-title text-[34px] leading-[1.05] text-white">
            {t('welcome.title')}
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-white/65 max-w-[36ch]">
            {t('welcome.subtitle')}
          </p>
        </div>

        <ul className="mt-10 space-y-2">
          {features.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3.5 rounded-2xl bg-white/[0.04] ring-1 ring-white/8 px-4 py-3.5 backdrop-blur-sm"
            >
              <span className="h-9 w-9 grid place-items-center rounded-xl bg-white/8 text-gold-300">
                {f.icon}
              </span>
              <span className="text-[13.5px] font-medium tracking-tight">{f.label}</span>
              <span className="ms-auto text-gold-300/90">
                <CheckIcon size={14} strokeWidth={2.5} />
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 pt-12">
          <Link to="/auth/register" className="block">
            <Button
              size="lg"
              block
              className="bg-white text-ink-950 hover:bg-white/95 shadow-plush"
            >
              {t('welcome.createAccount')}
            </Button>
          </Link>
          <Link to="/auth/login" className="block">
            <Button
              size="lg"
              block
              variant="ghost"
              className="text-white hover:bg-white/8"
            >
              {t('welcome.signIn')}
            </Button>
          </Link>
          <Link
            to="/merchant/welcome"
            className="block text-center text-[12.5px] text-gold-300 hover:text-gold-200 pt-1.5 font-medium"
          >
            {t('merchant.switchToMerchant')} — {t('merchant.openMerchantPortal')}
          </Link>
          <Link
            to="/admin/home"
            className="mt-1 flex items-center justify-center gap-1.5 text-[11.5px] text-white/55 hover:text-white/80"
          >
            <ShieldIcon size={11} />
            {t('welcome.adminDemo.label')}
            <span className="text-[9.5px] font-bold tracking-wide uppercase bg-white/10 ring-1 ring-white/15 rounded-full px-1.5 py-0.5">
              {t('welcome.adminDemo.pill')}
            </span>
          </Link>
          <p className="text-center text-[11px] text-white/40 leading-relaxed px-6 pt-2">
            {t('welcome.terms')}
          </p>
        </div>
      </div>
    </div>
  );
}
