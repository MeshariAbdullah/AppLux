import { Link } from 'react-router-dom';
import { LangToggle } from '@/components/auth/LangToggle';
import { BrandSlogan } from '@/components/brand/BrandSlogan';
import { LendLogo } from '@/components/brand/Logo';
import { ShieldIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useSupabaseAuth } from '@/lib/supabase';
import { cn } from '@/lib/cn';

// =====================================================================
// Public entry — customer design C01 (approved Conflict-1 decision).
// A deep-navy splash gate: brand mark + wordmark, the locked slogan,
// one short subtitle, then a beige action sheet with the two-role
// picker (customer solid navy / merchant outlined) and the sign-in
// link. The previous marketing surfaces (audience toggle, workflow
// preview, trust strip, partner strip + discovery sheet and its
// public listMerchants fetch) are removed per the approved decision;
// store discovery lives at /stores.
//
// Preserved: every destination (/auth/register, /auth/login,
// /merchant/welcome, demo-only /admin/home), the compact language
// toggle, and the terms line.
// =====================================================================

export default function Welcome() {
  const t = useT();
  const { configured } = useSupabaseAuth();

  return (
    <div className="relative flex flex-col min-h-full bg-navy-700 text-white">
      {/* Minimal-weight language control floating over the hero. */}
      <div className="absolute z-10 top-[calc(env(safe-area-inset-top)+14px)] end-5">
        <LangToggle tone="light" compact />
      </div>

      {/* Hero — C01: mark + LEND wordmark + slogan + subtitle, one
          vertically-centered block on navy. */}
      <div className="relative flex-1 flex flex-col items-center justify-center gap-5 px-7 pt-[calc(env(safe-area-inset-top)+24px)] pb-8 text-center">
        <LendLogo variant="mark" theme="dark" size={88} />
        <div
          className="text-[19px] font-bold tracking-[0.45em] text-white num"
          dir="ltr"
          aria-hidden
        >
          LEND
        </div>
        <BrandSlogan size="lg" tone="dark" className="!font-bold" />
        <p className="text-[13.5px] leading-[1.9] text-white/60 max-w-[28ch]">
          {t('welcome.entrySubtitle')}
        </p>
      </div>

      {/* Action sheet — C01: 24px top radius, role picker + sign-in. */}
      <div className="relative bg-beige-100 text-navy-700 rounded-t-3xl px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-3">
        <Link
          to="/auth/register"
          className={cn(
            'flex items-center justify-center h-13 w-full rounded-xl2 px-5',
            'bg-navy-700 text-white font-bold text-[15px] tracking-tight select-none',
            'hover:bg-navy-800 active:bg-navy-800 shadow-soft',
            'transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985]',
            'focus:outline-none',
          )}
        >
          {t('welcome.roleCustomer')}
        </Link>
        <Link
          to="/merchant/welcome"
          className={cn(
            'flex items-center justify-center h-13 w-full rounded-xl2 px-5',
            'bg-white text-navy-700 font-bold text-[15px] tracking-tight select-none',
            'ring-[1.5px] ring-inset ring-navy-700',
            'hover:bg-navy-50 active:bg-navy-50',
            'transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985]',
            'focus:outline-none',
          )}
        >
          {t('welcome.roleMerchant')}
        </Link>

        <div className="text-center text-[13px] text-ink-500 pt-0.5">
          {t('welcome.haveAccountPrefix')}{' '}
          <Link
            to="/auth/login"
            className="font-bold text-green-700 hover:text-green-800"
          >
            {t('welcome.signInLink')}
          </Link>
        </div>

        {/* Demo-only shortcut to the admin area. In configured mode
            RequireRole would just bounce non-admins back to /welcome,
            so we hide it entirely to avoid the confusing round-trip. */}
        {!configured && (
          <Link
            to="/admin/home"
            className="flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-700"
          >
            <ShieldIcon size={11} />
            {t('welcome.adminDemo.label')}
            <span className="text-[9.5px] font-bold tracking-wide uppercase bg-green-50 text-green-700 rounded-full px-1.5 py-0.5">
              {t('welcome.adminDemo.pill')}
            </span>
          </Link>
        )}

        <p className="text-center text-[11px] text-ink-400 leading-relaxed px-6">
          {t('welcome.terms')}
        </p>
      </div>
    </div>
  );
}
