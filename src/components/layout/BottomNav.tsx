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

  return (
    <nav
      className="sticky bottom-0 z-30 bg-canvas-50/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] border-t border-canvas-200/80"
      aria-label="primary"
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
                  isActive ? 'text-ink-900' : 'text-ink-400',
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
                        ? 'bg-ink-900 text-white scale-100 shadow-soft'
                        : 'bg-transparent text-ink-400 scale-95 group-hover:text-ink-700',
                    )}
                  >
                    <tab.icon size={19} />
                  </span>
                  <span className="leading-none">{tab.label}</span>
                  {/* Tiny gold underline indicator beneath active label. */}
                  <span
                    aria-hidden
                    className={cn(
                      'h-[3px] w-5 rounded-full transition-colors duration-200',
                      isActive ? 'bg-gold-400' : 'bg-transparent',
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
