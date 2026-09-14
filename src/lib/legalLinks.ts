// =====================================================================
// Legal & support link registry — App Store readiness.
//
// The privacy policy is a REVIEW REQUIREMENT (App Store guideline
// 5.1.1): it must be reachable inside the app for every role, so it
// carries a baked-in canonical URL and can never disappear because a
// build ran without the env var. VITE_PRIVACY_POLICY_URL remains an
// override for staging/rebrands.
//
// Terms and support stay env-gated ON PURPOSE: rendering a legal row
// that 404s is worse than not rendering it, so those rows only appear
// when a real URL/email is configured (.env.example documents them).
// =====================================================================

/** Canonical public privacy policy — always available in-app. */
export const PRIVACY_POLICY_URL =
  (import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined)?.trim() ||
  'https://www.lend.sa/privacy';

export const TERMS_URL =
  (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim() || '';

export const SUPPORT_URL =
  (import.meta.env.VITE_SUPPORT_URL as string | undefined)?.trim() || '';

export const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || '';
