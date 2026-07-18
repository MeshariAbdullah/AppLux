import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { DocIcon, HomeIcon, PackageIcon, UserIcon } from '@/components/icons';
import type { ReactNode } from 'react';

type Tab = {
  to: string;
  label: string;
  icon: (props: { size?: number }) => ReactNode;
};

export function BottomNav() {
  const t = useT();
  const tabs: Tab[] = [
    { to: '/home', label: t('nav.home'), icon: HomeIcon },
    { to: '/stores', label: t('nav.stores'), icon: PackageIcon },
    { to: '/contracts', label: t('nav.contracts'), icon: DocIcon },
    { to: '/profile', label: t('nav.profile'), icon: UserIcon },
  ];

  // Customer design C05/C06/C11/C13 bottom nav — same visual language
  // the approved merchant tab bar uses: WHITE bar, flat icons, active
  // tab = deep-green icon + bold green label (no filled circle, no
  // underline).
  return (
    <nav
      className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-beige-200"
      aria-label="primary"
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
