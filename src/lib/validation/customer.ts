// =====================================================================
// Customer signup validation — Bug 2. The SINGLE client-side schema
// for the customer registration fields (full name, National ID,
// email). Mobile stays in src/lib/mobile.ts (its own single source of
// truth, shared with the Deno edge copy); this module reuses its digit
// normalization convention.
//
// Everything here is dependency-free and pure so it can be bundled
// standalone for Node unit tests (same esbuild pattern as
// observability/sanitize.ts). The DB remains authoritative for
// uniqueness — these validators only decide what is ever SENT.
// =====================================================================

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII.
 *  Applied before every numeric validation so users typing with an
 *  Arabic keyboard are not rejected — and so one canonical
 *  representation is stored regardless of input script. */
export function normalizeDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ---------------------------------------------------------------------
// Full name
// ---------------------------------------------------------------------

/** Letters only: Latin A–Z/a–z plus Arabic letters. The two Arabic
 *  ranges deliberately skip U+063B–U+0640 (reserved + tatweel) and
 *  everything non-letter — Arabic-Indic digits, harakat, punctuation,
 *  emoji and symbols all fail. */
const NAME_PART = /^(?:[A-Za-z]+|[ء-غف-ي]+)$/;

export type FullNameIssue =
  | 'empty'
  | 'invalid_chars'
  | 'one_part'
  | 'too_short';

export type FullNameClassification =
  | { kind: 'valid'; normalized: string }
  | { kind: 'invalid'; issue: FullNameIssue };

/** Trim + collapse internal whitespace runs to single spaces. */
export function normalizeFullName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Valid = at least two name parts, every part letters-only (Arabic or
 * Latin), every part at least 2 letters. `normalized` is what should
 * be submitted/stored.
 */
export function classifyFullName(
  raw: string | null | undefined,
): FullNameClassification {
  const normalized = normalizeFullName(String(raw ?? ''));
  if (normalized.length === 0) return { kind: 'invalid', issue: 'empty' };
  const parts = normalized.split(' ');
  for (const part of parts) {
    if (!NAME_PART.test(part)) return { kind: 'invalid', issue: 'invalid_chars' };
  }
  if (parts.length < 2) return { kind: 'invalid', issue: 'one_part' };
  if (parts.some((p) => p.length < 2)) return { kind: 'invalid', issue: 'too_short' };
  return { kind: 'valid', normalized };
}

// ---------------------------------------------------------------------
// National ID
// ---------------------------------------------------------------------

export type NationalIdClassification =
  | { kind: 'valid'; canonical: string }
  | { kind: 'invalid'; issue: 'empty' | 'invalid' };

/**
 * Saudi National ID / Iqama — the app's approved convention (used by
 * the merchant contract-creation step and merchant onboarding — NOT by
 * customer signup; National ID is contract data since 20260502125100):
 * exactly 10 ASCII digits starting with 1 (citizen) or 2 (resident).
 * Arabic-Indic input is normalized first; anything else — letters,
 * symbols, spaces inside the number, wrong length — is invalid.
 */
export function classifyNationalId(
  raw: string | null | undefined,
): NationalIdClassification {
  const trimmed = normalizeDigits(String(raw ?? '').trim());
  if (trimmed.length === 0) return { kind: 'invalid', issue: 'empty' };
  if (!/^[12]\d{9}$/.test(trimmed)) return { kind: 'invalid', issue: 'invalid' };
  return { kind: 'valid', canonical: trimmed };
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------

export type EmailClassification =
  | { kind: 'valid'; canonical: string }
  | { kind: 'invalid'; issue: 'empty' | 'invalid' };

/** RFC-5321-practical local part: dot-atom only (quoted strings are
 *  rejected on purpose — no real customer address needs them). */
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
/** DNS label: alphanumeric with internal hyphens, 1–63 chars. */
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
/** TLD: alphabetic, at least 2 chars — rejects `saud@d.f`-style
 *  addresses that the old weak regex accepted. */
const TLD = /^[A-Za-z]{2,63}$/;

/**
 * Practical production-grade email validation: trims, lowercases (the
 * auth provider treats emails case-insensitively — one canonical
 * representation), then checks structure properly instead of the old
 * `x@y.z` regex. Supabase Auth stays authoritative for whether the
 * address exists / is deliverable.
 */
export function classifyEmail(raw: string | null | undefined): EmailClassification {
  const trimmed = String(raw ?? '').trim().toLowerCase();
  if (trimmed.length === 0) return { kind: 'invalid', issue: 'empty' };
  if (trimmed.length > 254) return { kind: 'invalid', issue: 'invalid' };
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return { kind: 'invalid', issue: 'invalid' };
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length > 64 || !EMAIL_LOCAL.test(local)) {
    return { kind: 'invalid', issue: 'invalid' };
  }
  if (domain.length > 253) return { kind: 'invalid', issue: 'invalid' };
  const labels = domain.split('.');
  // Require a registrable domain: at least two labels (host + TLD).
  if (labels.length < 2) return { kind: 'invalid', issue: 'invalid' };
  for (const label of labels) {
    if (!DOMAIN_LABEL.test(label)) return { kind: 'invalid', issue: 'invalid' };
  }
  if (!TLD.test(labels[labels.length - 1])) {
    return { kind: 'invalid', issue: 'invalid' };
  }
  return { kind: 'valid', canonical: trimmed };
}
