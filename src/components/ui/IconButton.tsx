import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'subtle' | 'glass';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  label: string;
  children: ReactNode;
};

const variantClass: Record<Variant, string> = {
  default: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-100 hover:bg-ink-50',
  subtle: 'bg-ink-50 text-ink-700 hover:bg-ink-100',
  glass: 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15 backdrop-blur',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'default', label, children, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
