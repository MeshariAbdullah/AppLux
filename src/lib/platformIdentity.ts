// =====================================================================
// Lend platform identity
// =====================================================================
// Centralizes the legal entity name used wherever the platform itself
// appears as a party — most importantly on the promissory note.
//
// Per the corrected business flow:
//   * The CONTRACT is between the merchant and the renter.
//   * The PROMISSORY NOTE is between the platform (Lend) and the
//     renter — the merchant is NOT a party on the note.
//
// This helper is the single source of truth for the platform's name
// across the UI, so both freshly created notes (where the RPC now
// persists the same constant on the row) and legacy notes (which
// embedded the merchant's company name) render the correct entity.
// =====================================================================

export const LEND_PLATFORM_NAME = {
  ar: 'شركة ليند تيكنولوجيز',
  en: 'Lend Technologies Co.',
} as const;

export function resolvePlatformBeneficiary(locale: 'ar' | 'en'): string {
  return LEND_PLATFORM_NAME[locale];
}
