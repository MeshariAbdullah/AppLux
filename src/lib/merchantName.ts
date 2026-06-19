import type { MerchantRow } from '@/lib/supabase';

// =====================================================================
// resolveMerchantName
// =====================================================================
// Single source of truth for "how do I label this merchant on the
// customer/merchant-facing pages." Resolves the name in this order:
//
//   1. merchant.display_name[locale]   (localized consumer-facing name)
//   2. merchant.display_name.ar
//   3. merchant.display_name.en
//   4. merchant.company_name           (legal trade name; NOT NULL)
//   5. fallback (defaults to '—')
//
// The legal `company_name` is always present in the schema, so the
// only way the fallback ever fires is when the row itself is null.
//
// Why this exists: every detail page used to do its own resolution
// (some read merchant.companyName from the demo store, some read
// promissory_notes.beneficiary_name which is the legal name, some
// wrote ad-hoc Localized objects). Centralizing here keeps every
// surface aligned on the same consumer-friendly display name.
// =====================================================================

export function resolveMerchantName(
  merchant: MerchantRow | null | undefined,
  locale: 'ar' | 'en',
  fallback: string = '—',
): string {
  if (!merchant) return fallback;
  const localized = merchant.display_name?.[locale];
  if (localized && localized.trim()) return localized.trim();
  const ar = merchant.display_name?.ar;
  if (ar && ar.trim()) return ar.trim();
  const en = merchant.display_name?.en;
  if (en && en.trim()) return en.trim();
  if (merchant.company_name && merchant.company_name.trim()) {
    return merchant.company_name.trim();
  }
  return fallback;
}
