import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
  className?: string;
};

export function Screen({ children, padded = true, className }: ScreenProps) {
  return (
    <main
      className={cn(
        'flex-1 overflow-y-auto no-scrollbar',
        padded && 'px-4 pb-6 pt-4 space-y-5',
        className,
      )}
    >
      {children}
    </main>
  );
}
