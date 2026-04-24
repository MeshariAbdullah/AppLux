import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger';
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
  // Deep ink as the main rest state — sits beautifully on cream canvas.
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 shadow-soft ' +
    'disabled:bg-ink-300 disabled:shadow-none',
  // Champagne gold for special CTAs (sign / approve / reserve).
  gold:
    'bg-gold-400 text-ink-950 hover:bg-gold-300 active:bg-gold-500 shadow-soft ' +
    'disabled:bg-gold-200 disabled:text-ink-400 disabled:shadow-none',
  // Calm secondary — warm canvas tint with a hairline of gold.
  secondary:
    'bg-canvas-50 text-ink-900 ring-1 ring-inset ring-gold-200/70 ' +
    'hover:bg-canvas-100 active:bg-canvas-200 ' +
    'disabled:text-ink-400 disabled:ring-canvas-200',
  ghost:
    'bg-transparent text-ink-700 hover:bg-canvas-100 active:bg-canvas-200 ' +
    'disabled:text-ink-400',
  danger:
    'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-600 shadow-soft ' +
    'disabled:bg-danger-500/60 disabled:shadow-none',
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
        'inline-flex items-center justify-center font-semibold select-none tracking-tight',
        'transition-[background-color,transform,box-shadow] duration-200 ease-plush',
        'active:scale-[0.985] disabled:active:scale-100',
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
