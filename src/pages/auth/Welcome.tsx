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
    { icon: <ShieldIcon size={18} />, label: t('welcome.feature1') },
    { icon: <WalletIcon size={18} />, label: t('welcome.feature2') },
    { icon: <ChartIcon size={18} />, label: t('welcome.feature3') },
  ];

  return (
    <div className="relative flex flex-col min-h-full bg-gradient-to-b from-ink-900 via-ink-800 to-ink-700 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 pattern-dots opacity-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 end-[-20%] h-72 w-72 rounded-full bg-brand-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 start-[-15%] h-60 w-60 rounded-full bg-gold-500/15 blur-3xl"
      />

      <div className="relative flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white text-ink-900 grid place-items-center font-bold">
            A
          </div>
          <span className="font-semibold tracking-wide">{t('welcome.eyebrow')}</span>
        </div>
        <LangToggle tone="light" />
      </div>

      <div className="relative flex-1 px-5 pt-12 pb-6 flex flex-col">
        <div className="mt-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15 text-[11.5px] font-medium text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400 animate-pulse" />
            {t('app.tagline')}
          </div>
          <h1 className="mt-4 text-[28px] leading-tight font-bold">{t('welcome.title')}</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/70 max-w-[34ch]">
            {t('welcome.subtitle')}
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
          <Link to="/auth/register" className="block">
            <Button size="lg" block className="bg-white text-ink-900 hover:bg-white/90">
              {t('welcome.createAccount')}
            </Button>
          </Link>
          <Link to="/auth/login" className="block">
            <Button size="lg" block variant="ghost" className="text-white hover:bg-white/10">
              {t('welcome.signIn')}
            </Button>
          </Link>
          <Link
            to="/merchant/welcome"
            className="block text-center text-[12px] text-gold-300 hover:text-gold-200 pt-1"
          >
            {t('merchant.switchToMerchant')} — {t('merchant.openMerchantPortal')}
          </Link>
          <Link
            to="/admin/home"
            className="mt-0.5 flex items-center justify-center gap-1.5 text-[11.5px] text-white/55 hover:text-white/80"
          >
            <ShieldIcon size={11} />
            {t('welcome.adminDemo.label')}
            <span className="text-[9.5px] font-bold tracking-wide uppercase bg-white/10 ring-1 ring-white/15 rounded-full px-1.5 py-0.5">
              {t('welcome.adminDemo.pill')}
            </span>
          </Link>
          <p className="text-center text-[11.5px] text-white/50 leading-relaxed px-6">
            {t('welcome.terms')}
          </p>
        </div>
      </div>
    </div>
  );
}
