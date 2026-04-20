import type { ReactNode } from 'react';

type MobileShellProps = {
  children: ReactNode;
};

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div className="min-h-dvh w-full flex items-stretch justify-center">
      <div className="relative w-full max-w-[440px] min-h-dvh bg-ink-50 flex flex-col overflow-hidden shadow-float md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[2rem] md:ring-1 md:ring-white/10">
        {children}
      </div>
    </div>
  );
}
