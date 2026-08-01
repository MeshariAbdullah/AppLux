import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from './FormField';
import { normalizeDigits } from '@/lib/validation/customer';
import { cn } from '@/lib/cn';

// =====================================================================
// Numeric field primitives — one LTR numeric behavior for every
// identity / registration / phone field, in BOTH Arabic and English.
//
// The container inherits page direction; the VALUE is always dir="ltr",
// left-aligned, tabular (`num`), so digits never bidi-reverse and the
// caret runs left→right. Arabic-Indic digits are normalized to Latin on
// input, so a value typed on an Arabic keyboard is stored canonically.
// text/tel inputs (never <input type=number>) so leading zeros and
// pasted values survive.
// =====================================================================

/** Public alias — the digit-normalizer used across onboarding. */
export const normalizeLatinDigits = normalizeDigits;

type NumericFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'type' | 'dir'
> & {
  value: string;
  /** Receives the already digit-normalized (Latin) string. */
  onValueChange: (next: string) => void;
  invalid?: boolean;
  /** Keep only [0-9] (default true). Set false for map links etc. */
  digitsOnly?: boolean;
  maxDigits?: number;
};

export const NumericField = forwardRef<HTMLInputElement, NumericFieldProps>(
  function NumericField(
    { value, onValueChange, invalid, digitsOnly = true, maxDigits, inputMode = 'numeric', className, ...rest },
    ref,
  ) {
    return (
      <Input
        ref={ref}
        dir="ltr"
        inputMode={inputMode}
        invalid={invalid}
        value={value}
        onChange={(e) => {
          let next = normalizeDigits(e.target.value);
          if (digitsOnly) next = next.replace(/\D/g, '');
          if (maxDigits) next = next.slice(0, maxDigits);
          onValueChange(next);
        }}
        className={cn('num text-left', className)}
        {...rest}
      />
    );
  },
);

type SaudiMobileFieldProps = {
  value: string; // canonical 5XXXXXXXX (no prefix)
  onValueChange: (next: string) => void;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  autoComplete?: string;
};

/** Saudi mobile as ONE left-to-right unit: a fixed `+966` chip on the
 *  left, then up to 9 digits typed left→right. Stores the bare
 *  `5XXXXXXXX`. Identical layout in Arabic and English. */
export const SaudiMobileField = forwardRef<HTMLInputElement, SaudiMobileFieldProps>(
  function SaudiMobileField({ value, onValueChange, invalid, id, placeholder = '5XXXXXXXX', autoComplete = 'tel' }, ref) {
    return (
      <div dir="ltr">
        <Input
          ref={ref}
          id={id}
          dir="ltr"
          inputMode="tel"
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={20}
          invalid={invalid}
          value={value}
          onChange={(e) => {
            const digits = normalizeDigits(e.target.value)
              .replace(/\D/g, '')
              .replace(/^(?:00?966|966|0)/, '') // tolerate pasted prefixes
              .slice(0, 9);
            onValueChange(digits);
          }}
          leading={<span className="text-ink-500 text-[13px] font-medium num" dir="ltr">+966</span>}
          className="num text-left"
        />
      </div>
    );
  },
);
