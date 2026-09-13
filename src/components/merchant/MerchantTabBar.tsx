import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { DocIcon, HomeIcon, PlusIcon, UserIcon } from '@/components/icons';
import type { ReactNode } from 'react';

// =====================================================================
// MerchantTabBar — design D1 (Lend Merchant Screens M09/M12/M16).
// Four tabs: home / rentals / issue / account. Rendered EXCLUSIVELY
// by MerchantAppLayout as the app shell's LAST ROW (exactly like the
// customer BottomNav): the shell column is fixed-height and <Screen>
// is the only scroll region, so the bar is pinned to the viewport
// bottom on every authenticated merchant page and can never scroll,
// jump, or disappear. Auth/onboarding routes live outside the layout
// and show no nav. Never render this from a page.
// =====================================================================

type Tab = {
  to: string;
  label: string;
  icon: (props: { size?: number }) => ReactNode;
};

export function MerchantTabBar() {
  const t = useT();
  const tabs: Tab[] = [
    { to: '/merchant/home', label: t('merchant.tabs.home'), icon: HomeIcon },
    { to: '/merchant/rentals', label: t('merchant.tabs.rentals'), icon: DocIcon },
    { to: '/merchant/session/new', label: t('merchant.tabs.issue'), icon: PlusIcon },
    { to: '/merchant/profile', label: t('merchant.tabs.account'), icon: UserIcon },
  ];

  // Design M09/M12/M16 bottom nav: WHITE bar, flat icons, active tab =
  // deep-green icon + bold green label (no filled circle, no underline).
  return (
    <nav
      className="shrink-0 z-30 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-beige-200"
      aria-label="merchant"
    >
      {/* Tablet/desktop: cap the row so the four tabs stay a reachable
          cluster instead of spreading across the widened canvas. */}
      <ul className="grid grid-cols-4 px-2 pt-2.5 pb-3 mx-auto w-full max-w-[560px]">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'group flex flex-col items-center justify-center gap-1 py-0.5',
                  'text-[11px] tracking-tight transition-colors',
                  isActive
                    ? 'text-green-700 font-bold'
                    : 'text-ink-400 font-medium hover:text-navy-700',
                )
              }
            >
              <span className="grid place-items-center h-6 transition-colors duration-200 ease-plush">
                <tab.icon size={20} />
              </span>
              <span className="leading-none">{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
