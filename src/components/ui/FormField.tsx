import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

type FieldShellProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optionalLabel?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({
  label,
  hint,
  error,
  required,
  optionalLabel,
  htmlFor,
  children,
  className,
}: FieldShellProps) {
  return (
    <label htmlFor={htmlFor} className={cn('block', className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink-700 leading-none">
            {label}
            {required && <span className="ms-1 text-danger-500">*</span>}
          </span>
          {!required && optionalLabel && (
            <span className="text-[11px] font-medium text-ink-400 leading-none">
              {optionalLabel}
            </span>
          )}
        </div>
      )}
      {children}
      {error ? (
        <div className="mt-1.5 text-[12px] font-medium text-danger-600 leading-snug">
          {error}
        </div>
      ) : hint ? (
        <div className="mt-1.5 text-[12px] text-ink-400 leading-snug">{hint}</div>
      ) : null}
    </label>
  );
}

const controlBase =
  'block w-full rounded-xl bg-white ring-1 ring-inset ring-ink-200/80 text-ink-900 placeholder:text-ink-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-400 transition-shadow ' +
  'disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed disabled:ring-ink-100';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  leading?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, invalid, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  if (!leading && !trailing) {
    return (
      <input
        ref={ref}
        id={inputId}
        className={cn(
          controlBase,
          'h-11 px-3.5 text-[14px]',
          invalid && 'ring-danger-500 focus:ring-danger-500',
          className,
        )}
        {...rest}
      />
    );
  }
  return (
    <div
      className={cn(
        controlBase,
        'flex items-center h-11 px-3 gap-2 text-[14px]',
        invalid && 'ring-danger-500 focus-within:ring-danger-500',
        'focus-within:ring-2 focus-within:ring-brand-400',
      )}
    >
      {leading && <span className="text-ink-400 shrink-0">{leading}</span>}
      <input
        ref={ref}
        id={inputId}
        className="flex-1 bg-transparent outline-none placeholder:text-ink-300"
        {...rest}
      />
      {trailing && <span className="text-ink-400 shrink-0">{trailing}</span>}
    </div>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        controlBase,
        'px-3.5 py-3 text-[14px] resize-none leading-relaxed',
        invalid && 'ring-danger-500 focus:ring-danger-500',
        className,
      )}
      {...rest}
    />
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          controlBase,
          'h-11 ps-3.5 pe-10 text-[14px] appearance-none',
          invalid && 'ring-danger-500 focus:ring-danger-500',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 end-3 -translate-y-1/2 text-ink-400"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
});
