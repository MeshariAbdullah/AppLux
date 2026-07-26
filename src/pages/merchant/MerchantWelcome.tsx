import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LangToggle } from '@/components/auth/LangToggle';
import { LendLogo } from '@/components/brand/Logo';
import { CheckIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useSupabaseAuth } from '@/lib/supabase';
import { cn } from '@/lib/cn';

// =====================================================================
// Merchant welcome — design M01. Deep-navy hero (logo, FOR MERCHANTS
// eyebrow, two-line headline with green second line, three green
// check bullets) over a beige action sheet: green primary "apply",
// outlined navy "merchant sign-in", and the customer-portal escape
// hatch. Behavior unchanged: authenticated merchants skip straight to
// their dashboard; customers/admins may browse.
// =====================================================================

export default function MerchantWelcome() {
  const t = useT();
  const navigate = useNavigate();
  const { configured, status, role } = useSupabaseAuth();

  useEffect(() => {
    if (configured && status === 'authenticated' && role === 'merchant') {
      navigate('/merchant/home', { replace: true });
    }
  }, [configured, status, role, navigate]);

  const features = [
    t('merchant.entry.feature1'),
    t('merchant.entry.feature2'),
    t('merchant.entry.feature3'),
  ];

  return (
    // Shell contract: every direct shell child is a bar or a
    // scroller. This full-bleed page scrolls itself; the inner
    // wrapper keeps min-h-full so short content still fills the
    // viewport (its background covers the safe areas too).
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar bg-navy-700">
      <div className="relative flex flex-col min-h-full bg-navy-700 text-white">
      {/* Language control floats over the hero with minimal weight —
          the M01 composition has no top bar, so nothing else takes
          vertical space above the centered content. */}
      <div className="absolute z-10 top-[calc(env(safe-area-inset-top)+14px)] end-5">
        <LangToggle tone="light" compact />
      </div>

      {/* Hero — M01: logo + eyebrow + headline + subtitle + bullets as
          ONE vertically-centered block (uniform 18px rhythm), filling
          the navy area above the sheet. */}
      <div className="relative flex-1 flex flex-col justify-center gap-[18px] px-7 pt-[calc(env(safe-area-inset-top)+24px)] pb-6">
        <LendLogo variant="mark" theme="dark" size={56} />
        {/* Latin eyebrow — the block stays start-aligned (right in RTL,
            matching M01); only the inline span runs LTR for the Latin
            glyph order. */}
        <div className="text-[11px] font-bold tracking-[0.25em] text-green-200">
          <span className="num" dir="ltr">FOR MERCHANTS</span>
        </div>
        <h1 className="text-[27px] font-bold leading-[1.55]">
          {t('merchant.entry.titleA')}
          <br />
          <span className="text-green-500">{t('merchant.entry.titleB')}</span>
        </h1>
        <p className="text-[13.5px] leading-[1.9] text-white/70 max-w-[280px]">
          {t('merchant.entry.subtitle')}
        </p>
        <ul className="space-y-2.5">
          {features.map((label, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[13px]">
              <span className="h-5 w-5 shrink-0 rounded-full bg-green-500/25 grid place-items-center text-green-500">
                <CheckIcon size={10} strokeWidth={3} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Action sheet — M01: 24px top radius, 24/20/28 padding, 12px
          row gap; sits flush at the bottom of the viewport. */}
      <div className="relative bg-beige-100 text-navy-700 rounded-t-3xl px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+28px)] space-y-3">
        <Link
          to="/merchant/register"
          className={cn(
            'flex items-center justify-center h-13 w-full rounded-xl2 px-5',
            'bg-green-500 text-white font-bold text-[15px] tracking-tight select-none',
            'hover:bg-green-600 active:bg-green-600 shadow-soft',
            'transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985]',
            'focus:outline-none',
          )}
        >
          {t('merchant.entry.register')}
        </Link>
        <Link
          to="/merchant/login"
          className={cn(
            'flex items-center justify-center h-13 w-full rounded-xl2 px-5',
            'bg-white text-navy-700 font-bold text-[15px] tracking-tight select-none',
            'ring-[1.5px] ring-inset ring-navy-700',
            'hover:bg-navy-50 active:bg-navy-50',
            'transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985]',
            'focus:outline-none',
          )}
        >
          {t('merchant.entry.login')}
        </Link>
        <div className="text-center text-[13px] text-ink-500">
          {t('merchant.entry.switchPrefix')}{' '}
          <Link to="/welcome" className="font-bold text-navy-700 hover:text-green-700">
            {t('merchant.entry.switchLink')}
          </Link>
        </div>
        <p className="text-center text-[11px] text-ink-400 leading-relaxed px-6">
          {t('welcome.terms')}
        </p>
      </div>
      </div>
    </div>
  );
}
