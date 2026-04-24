import type { ReactNode } from 'react';

type MobileShellProps = {
  children: ReactNode;
};

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div className="min-h-dvh w-full flex items-stretch justify-center">
      <div
        className="relative w-full max-w-[440px] min-h-dvh bg-canvas-50 flex flex-col overflow-hidden shadow-plush
                   md:my-8 md:min-h-[calc(100dvh-4rem)] md:rounded-[2.25rem]
                   md:shadow-[0_50px_120px_-30px_rgba(20,14,6,0.30),0_12px_30px_-12px_rgba(20,14,6,0.12)]
                   md:hairline"
      >
        {children}
      </div>
    </div>
  );
}
