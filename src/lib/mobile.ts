/**
 * Mobile-number parsing, normalization and validation for Saudi formats.
 *
 * This module is the SINGLE SOURCE OF TRUTH for Saudi mobile handling
 * across the app — registration, renter lookup, OTP service layer and
 * any future caller all consume `classifyMobile()` (or its convenience
 * wrapper `normalizeMobile()`). The Deno OTP edge functions import a
 * verbatim copy at `supabase/functions/_shared/mobile.ts`; keep both in
 * sync — there is no other place where parsing rules may diverge.
 *
 * Canonical storage shape (in `profiles.mobile`):
 *   `5XXXXXXXX` — exactly 9 digits, no prefix, starts with 5.
 *
 * Accepted user inputs:
 *   - `5XXXXXXXX`
 *   - `05XXXXXXXX`
 *   - `9665XXXXXXXX`
 *   - `+9665XXXXXXXX`
 *   - `009665XXXXXXXX`
 *   - whitespace, dashes, parentheses are stripped
 */
export type NormalizedMobile = {
  /** 9 digits, starts with 5 — matches `profiles.mobile` storage shape. */
  canonical: string;
  /** E.164 form for SMS providers. */
  e164: string;
};

/**
 * Distinguishes the *reason* a mobile didn't normalize, so the UI can
 * render the exact message that helps the user fix it — instead of a
 * vague "invalid number".
 *
 * - `empty` — user typed nothing.
 * - `incomplete` — looks like a Saudi number that isn't finished yet
 *   (e.g. `512` or `+9665`). Treat as not-yet-valid, not "wrong".
 * - `invalid_format` — looks Saudi-shaped but cannot be a Saudi mobile
 *   (wrong starting digit, too many digits, etc).
 * - `unsupported_country` — user typed a non-KSA country code
 *   (e.g. `+1...`, `+44...`). We only support +966.
 */
export type MobileIssue =
  | 'empty'
  | 'incomplete'
  | 'invalid_format'
  | 'unsupported_country';

export type MobileClassification =
  | { kind: 'valid'; canonical: string; e164: string }
  | { kind: 'invalid'; issue: MobileIssue };

export function classifyMobile(raw: string | null | undefined): MobileClassification {
  if (raw === null || raw === undefined) return { kind: 'invalid', issue: 'empty' };
  const original = String(raw);
  const trimmed = original.trim();
  if (trimmed.length === 0) return { kind: 'invalid', issue: 'empty' };

  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return { kind: 'invalid', issue: 'empty' };

  let core = digits;
  let hadKsaPrefix = false;
  if (digits.startsWith('00966')) {
    core = digits.slice(5);
    hadKsaPrefix = true;
  } else if (digits.startsWith('966')) {
    core = digits.slice(3);
    hadKsaPrefix = true;
  } else if (digits.startsWith('0')) {
    // Local Saudi prefix. We don't flag this as a foreign country code.
    core = digits.slice(1);
  }

  // `+<non-966>` — caller explicitly typed an international prefix
  // that isn't Saudi Arabia. Don't silently swallow this.
  if (hadPlus && !hadKsaPrefix) {
    return { kind: 'invalid', issue: 'unsupported_country' };
  }

  if (core.length === 0) return { kind: 'invalid', issue: 'incomplete' };

  if (!core.startsWith('5')) {
    return { kind: 'invalid', issue: 'invalid_format' };
  }

  if (core.length < 9) return { kind: 'invalid', issue: 'incomplete' };
  if (core.length > 9) return { kind: 'invalid', issue: 'invalid_format' };

  return { kind: 'valid', canonical: core, e164: `+966${core}` };
}

/**
 * Convenience: returns the normalized pair when valid, `null` otherwise.
 * Use `classifyMobile()` directly when the UI needs to explain *why* a
 * number didn't pass.
 */
export function normalizeMobile(raw: string | null | undefined): NormalizedMobile | null {
  const c = classifyMobile(raw);
  return c.kind === 'valid' ? { canonical: c.canonical, e164: c.e164 } : null;
}

/** Convenience predicate for form-level validation. */
export function isValidSaudiMobile(raw: string | null | undefined): boolean {
  return classifyMobile(raw).kind === 'valid';
}

/** Mask all but the last 4 digits of a canonical mobile for OTP UI. */
export function maskMobile(canonical: string): string {
  if (canonical.length < 4) return canonical;
  return `•••${canonical.slice(-4)}`;
}
