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
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink-800 leading-none">
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
        <div className="mt-2 text-[12px] font-medium text-danger-600 leading-snug">
          {error}
        </div>
      ) : hint ? (
        <div className="mt-2 text-[12px] text-ink-400 leading-snug">{hint}</div>
      ) : null}
    </label>
  );
}

// Warm, plush surface for inputs — sits softly on cream canvas.
const controlBase =
  'block w-full rounded-xl2 bg-white text-ink-900 placeholder:text-ink-300 ' +
  'shadow-hairline transition-shadow duration-200 ease-plush ' +
  'focus:outline-none focus:shadow-[0_0_0_2px_rgba(212,168,85,0.45),inset_0_0_0_1px_rgba(212,168,85,0.55)] ' +
  'disabled:bg-canvas-100 disabled:text-ink-400 disabled:cursor-not-allowed';

const invalidShadow =
  'shadow-[0_0_0_1px_rgba(220,38,38,0.55)] focus:shadow-[0_0_0_2px_rgba(220,38,38,0.40),inset_0_0_0_1px_rgba(220,38,38,0.55)]';

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
          'h-12 px-4 text-[14.5px]',
          invalid && invalidShadow,
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
        'flex items-center h-12 px-3.5 gap-2.5 text-[14.5px]',
        invalid && invalidShadow,
        'focus-within:shadow-[0_0_0_2px_rgba(212,168,85,0.45),inset_0_0_0_1px_rgba(212,168,85,0.55)]',
      )}
    >
      {leading && <span className="text-ink-400 shrink-0">{leading}</span>}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          // `min-w-0` is essential: a flex child's default `min-width:auto`
          // resolves to the input's intrinsic width (~default size=20),
          // which refuses to shrink below ~181px. In a narrow grid cell
          // that overflows the shell — pushing the value to the page edge
          // and the trailing suffix off-screen. `min-w-0` lets flex-1 fit.
          'flex-1 min-w-0 bg-transparent outline-none placeholder:text-ink-300',
          // merge caller className (previously dropped) so numeric/dir
          // styling reaches the actual input in the leading/trailing shell
          className,
        )}
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
        'px-4 py-3.5 text-[14.5px] resize-none leading-relaxed',
        invalid && invalidShadow,
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
          'h-12 ps-4 pe-10 text-[14.5px] appearance-none',
          invalid && invalidShadow,
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
