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
import { useSupabaseAuth } from '@/lib/supabase';
import { SECTORS } from '@/lib/sectors';

export default function Welcome() {
  const t = useT();
  const { configured } = useSupabaseAuth();

  const features = [
    { icon: <ShieldIcon size={16} />, label: t('welcome.feature1') },
    { icon: <WalletIcon size={16} />, label: t('welcome.feature2') },
    { icon: <ChartIcon size={16} />, label: t('welcome.feature3') },
  ];

  return (
    <div className="relative flex flex-col min-h-full bg-white text-ink-900">
      {/* Soft lavender wash anchored top-end, ivory wash anchored bottom-start. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 end-[-25%] h-80 w-80 rounded-full bg-lavender-200/55 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 start-[-25%] h-72 w-72 rounded-full bg-lavender-100 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-lavender-50/70 to-transparent"
      />

      <div className="relative flex items-center justify-end px-5 pt-[calc(env(safe-area-inset-top)+22px)]">
        <LangToggle tone="dark" />
      </div>

      <div className="relative flex-1 px-6 pt-10 pb-8 flex flex-col">
        {/* Editorial logotype block */}
        <div className="text-center">
          <h1 className="editorial-title text-[44px] leading-none text-ink-900">
            {t('welcome.eyebrow')}
          </h1>
          <p className="mt-2 text-[12.5px] uppercase tracking-[0.18em] text-lavender-600 font-semibold">
            {t('app.tagline')}
          </p>
          <p className="mt-5 text-[13.5px] leading-relaxed text-ink-500 max-w-[34ch] mx-auto">
            {t('welcome.subtitle')}
          </p>
        </div>

        {/* Feature pills */}
        <ul className="mt-10 space-y-2.5">
          {features.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3.5 rounded-2xl bg-white ring-1 ring-lavender-100 shadow-soft px-4 py-3.5"
            >
              <span className="h-9 w-9 grid place-items-center rounded-xl bg-lavender-50 text-lavender-600">
                {f.icon}
              </span>
              <span className="text-[13.5px] font-medium tracking-tight text-ink-800">
                {f.label}
              </span>
              <span className="ms-auto text-lavender-500">
                <CheckIcon size={14} strokeWidth={2.5} />
              </span>
            </li>
          ))}
        </ul>

        {/* Sectors block — describes the platform's coverage scope so
            visitors understand Lend isn't boutique-only. Sub-categories
            display as inline tags under each sector name. */}
        <section className="mt-10">
          <div className="text-center">
            <h2 className="editorial-title text-[20px] text-ink-900 leading-tight">
              {t('welcome.sectors.title')}
            </h2>
            <p className="mt-1.5 text-[12.5px] text-ink-500 leading-relaxed max-w-[34ch] mx-auto">
              {t('welcome.sectors.subtitle')}
            </p>
          </div>
          <div className="mt-5 space-y-2.5">
            {SECTORS.map((sector, i) => (
              <div
                key={sector.key}
                className="rounded-2xl bg-white ring-1 ring-lavender-100 shadow-soft p-4"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-xl bg-lavender-50 text-lavender-700 grid place-items-center text-[13px] font-bold">
                    {i + 1}
                  </span>
                  <div className="text-[14px] font-semibold text-ink-900">
                    {t(sector.i18nName)}
                  </div>
                </div>
                <div className="mt-2.5 ps-10 text-[12px] text-ink-500 leading-relaxed">
                  {t(sector.i18nSub)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA stack */}
        <div className="mt-auto space-y-2.5 pt-12">
          <Link to="/auth/register" className="block">
            <Button size="lg" block variant="primary">
              {t('welcome.createAccount')}
            </Button>
          </Link>
          <Link to="/auth/login" className="block">
            <Button size="lg" block variant="secondary">
              {t('welcome.signIn')}
            </Button>
          </Link>
          <Link
            to="/merchant/welcome"
            className="block text-center text-[12.5px] text-lavender-600 hover:text-lavender-700 pt-2.5 font-semibold"
          >
            {t('merchant.switchToMerchant')} — {t('merchant.openMerchantPortal')}
          </Link>
          {/* Demo-only shortcut to the admin area. In configured mode
              RequireRole would just bounce non-admins back to /welcome,
              so we hide it entirely to avoid the confusing round-trip. */}
          {!configured && (
            <Link
              to="/admin/home"
              className="mt-0.5 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-700"
            >
              <ShieldIcon size={11} />
              {t('welcome.adminDemo.label')}
              <span className="text-[9.5px] font-bold tracking-wide uppercase bg-lavender-50 text-lavender-700 rounded-full px-1.5 py-0.5">
                {t('welcome.adminDemo.pill')}
              </span>
            </Link>
          )}
          <p className="text-center text-[11px] text-ink-400 leading-relaxed px-6 pt-2">
            {t('welcome.terms')}
          </p>
        </div>
      </div>
    </div>
  );
}
