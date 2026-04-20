import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { BellIcon, DocIcon, HomeIcon, UserIcon } from '@/components/icons';
import type { ReactNode } from 'react';

type Tab = { to: string; label: string; icon: (props: { size?: number }) => ReactNode };

export function BottomNav() {
  const t = useT();
  const tabs: Tab[] = [
    { to: '/home', label: t('nav.home'), icon: HomeIcon },
    { to: '/contracts', label: t('nav.contracts'), icon: DocIcon },
    { to: '/notifications', label: t('nav.notifications'), icon: BellIcon },
    { to: '/profile', label: t('nav.profile'), icon: UserIcon },
  ];

  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-ink-100 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="primary"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-ink-900' : 'text-ink-400 hover:text-ink-600',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'h-9 w-12 grid place-items-center rounded-full transition-all',
                      isActive ? 'bg-ink-900 text-white' : 'bg-transparent',
                    )}
                  >
                    <tab.icon size={20} />
                  </span>
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
