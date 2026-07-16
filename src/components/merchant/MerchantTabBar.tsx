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

  return (
    <nav
      className="sticky bottom-0 z-30 bg-beige-100/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-beige-300/70"
      aria-label="merchant"
    >
      <ul className="grid grid-cols-4 px-2 pt-2 pb-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'group flex flex-col items-center justify-center gap-1.5 py-1.5',
                  'text-[10.5px] font-medium tracking-tight transition-colors',
                  isActive ? 'text-navy-700' : 'text-ink-400',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'h-9 w-9 grid place-items-center rounded-full relative',
                      'transition-[background-color,color,transform] duration-200 ease-plush',
                      isActive
                        ? 'bg-navy-700 text-white scale-100 shadow-soft'
                        : 'bg-transparent text-ink-400 scale-95 group-hover:text-navy-700',
                    )}
                  >
                    <tab.icon size={19} />
                  </span>
                  <span className="leading-none">{tab.label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'h-[3px] w-5 rounded-full transition-colors duration-200',
                      isActive ? 'bg-green-500' : 'bg-transparent',
                    )}
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
