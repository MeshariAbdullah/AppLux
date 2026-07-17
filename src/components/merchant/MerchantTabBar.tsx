import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { DocIcon, HomeIcon, PlusIcon, UserIcon } from '@/components/icons';
import type { ReactNode } from 'react';

// =====================================================================
// MerchantTabBar — design D1 (Lend Merchant Screens M09/M12/M16).
// Four tabs: home / rentals / issue / account. Rendered ONLY by the
// primary merchant surfaces (dashboard, rentals list, profile, and
// the secondary lists) — never on registration, login, the pending
// page, or focused form flows. Mirrors the customer BottomNav's
// proven sticky + safe-area structure so browser and Capacitor
// scrolling behave identically; pages that render it add bottom
// padding so sticky actions never sit underneath it.
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
      className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-beige-200"
      aria-label="merchant"
    >
      <ul className="grid grid-cols-4 px-2 pt-2.5 pb-3">
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
