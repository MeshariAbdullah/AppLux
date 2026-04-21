import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

const variantClass: Record<Variant, string> = {
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 shadow-soft disabled:bg-ink-300 disabled:shadow-none',
  secondary:
    'bg-white text-ink-900 ring-1 ring-inset ring-ink-200/80 hover:bg-ink-50 active:bg-ink-100 shadow-soft disabled:text-ink-400 disabled:ring-ink-100',
  ghost:
    'bg-transparent text-ink-700 hover:bg-ink-50 active:bg-ink-100 disabled:text-ink-400',
  danger:
    'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-600 shadow-soft disabled:bg-danger-500/60 disabled:shadow-none',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-9 text-[13px] px-3.5 rounded-xl gap-1.5',
  md: 'h-11 text-[14px] px-4 rounded-xl2 gap-2',
  lg: 'h-13 text-[15px] px-5 rounded-xl2 gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block,
    loading,
    leading,
    trailing,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold select-none',
        'transition-[background-color,transform,box-shadow] duration-150',
        'active:scale-[0.98] disabled:active:scale-100',
        'focus:outline-none',
        'disabled:opacity-70 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        leading
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && trailing}
    </button>
  );
});
