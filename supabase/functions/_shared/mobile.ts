/**
 * Mobile-number parsing, normalization and validation for Saudi formats.
 *
 * This is a VERBATIM mirror of `src/lib/mobile.ts` — kept in sync so the
 * Deno OTP edge functions classify numbers identically to the browser.
 * Any change here must be made in `src/lib/mobile.ts` first, then copied
 * across. There is no other place where parsing rules may diverge.
 */
export type NormalizedMobile = {
  canonical: string;
  e164: string;
};

export type MobileIssue =
  | 'empty'
  | 'incomplete'
  | 'invalid_format'
  | 'unsupported_country';

export type MobileClassification =
  | { kind: 'valid'; canonical: string; e164: string }
  | { kind: 'invalid'; issue: MobileIssue };

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII —
 *  keep in sync with src/lib/mobile.ts (Bug 2). */
function normalizeArabicDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Live input sanitizer for the local-part mobile field — keep in sync
 *  with src/lib/mobile.ts (single source of parsing rules). */
export function sanitizeMobileInput(raw: string): string {
  let digits = normalizeArabicDigits(String(raw)).replace(/\D/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(5);
  else if (digits.startsWith('966')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return digits.slice(0, 9);
}

export function classifyMobile(raw: string | null | undefined): MobileClassification {
  if (raw === null || raw === undefined) return { kind: 'invalid', issue: 'empty' };
  const original = normalizeArabicDigits(String(raw));
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
    core = digits.slice(1);
  }

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

export function normalizeMobile(raw: string | null | undefined): NormalizedMobile | null {
  const c = classifyMobile(raw);
  return c.kind === 'valid' ? { canonical: c.canonical, e164: c.e164 } : null;
}

export function isValidSaudiMobile(raw: string | null | undefined): boolean {
  return classifyMobile(raw).kind === 'valid';
}
