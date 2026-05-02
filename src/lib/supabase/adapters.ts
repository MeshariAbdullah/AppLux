// Adapters that map Supabase DB rows to the existing UI types,
// so screens can switch data sources without changing their render code.

import type {
  Localized,
  PartnerStore,
  RentalEligibility,
  StoreBranch,
  StoreCategory,
} from '@/lib/data';
import type { AdminMerchantRequest } from '@/lib/store';
import type {
  MerchantApplicationRow,
  MerchantRow,
  RentalCategoryDB,
  RentalEligibilityRow,
} from './types';

// ---------------------------------------------------------------------
// Eligibility: rental_eligibility → RentalEligibility
// ---------------------------------------------------------------------

export function adaptEligibility(row: RentalEligibilityRow): RentalEligibility {
  const limit = Number(row.limit_amount);
  const used = Number(row.used_amount);
  return {
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    tier: row.tier,
    assignedBy: 'AppLux',
    assignedAt: row.assigned_at,
  };
}

// ---------------------------------------------------------------------
// Partner stores: merchants → PartnerStore (consumer-facing browse shape)
// ---------------------------------------------------------------------

const SINGULAR_TO_PLURAL: Record<RentalCategoryDB, StoreCategory> = {
  dress: 'dresses',
  bag: 'bags',
  watch: 'watches',
  bisht: 'bishts',
};

function localized(
  value: { ar: string; en: string } | null | undefined,
): Localized {
  if (!value) return { ar: '', en: '' };
  return { ar: value.ar ?? '', en: value.en ?? '' };
}

function deriveInitials(name: Localized): string {
  const source = (name.en || name.ar || '').trim();
  if (!source) return '••';
  const tokens = source.split(/\s+/).slice(0, 2);
  return tokens.map((t) => t[0]?.toUpperCase() ?? '').join('') || source.slice(0, 2);
}

export function adaptMerchantToStore(row: MerchantRow): PartnerStore {
  const name = localized(row.display_name);
  const description = localized(row.about);

  // The MVP `merchants` table is single-branch; the UI's branch list is
  // therefore a one-element array stitched from the merchant's own city.
  // Real branches arrive in Phase 4 via the merchant_branches table.
  const primaryBranch: StoreBranch = {
    id: `${row.id}-primary`,
    name,
    address: { ar: row.city, en: row.city },
    phone: '',
    hours: { ar: '', en: '' },
  };

  return {
    id: row.id,
    name,
    initials: deriveInitials(name),
    category: SINGULAR_TO_PLURAL[row.primary_category] ?? 'dresses',
    city: row.city,
    location: { ar: row.city, en: row.city },
    description,
    rating: Number(row.rating ?? 0),
    hours: { ar: '', en: '' },
    logoTone: 'gold',
    verified: row.verified,
    branches: [primaryBranch],
  };
}

// ---------------------------------------------------------------------
// Merchant applications: merchant_applications → AdminMerchantRequest
// (the list/detail UI shape used by the admin review screens).
// Demo-only fields the schema doesn't carry yet (vat, iban, address,
// expectedVolume, branches, evidence) are filled with safe defaults.
// Phase 4 will enrich the schema or add per-application detail rows.
// ---------------------------------------------------------------------

function deriveTextInitials(text: string): string {
  const tokens = text.trim().split(/\s+/).slice(0, 2);
  return tokens.map((t) => t[0]?.toUpperCase() ?? '').join('') || text.slice(0, 2);
}

const DB_TO_STORE_CATEGORY: Record<RentalCategoryDB, StoreCategory> = SINGULAR_TO_PLURAL;

export function adaptMerchantApplication(
  row: MerchantApplicationRow,
): AdminMerchantRequest {
  return {
    id: row.id,
    companyName: row.company_name,
    authorizedName: row.authorized_name,
    authorizedId: row.authorized_national_id,
    commercialReg: row.commercial_reg_number,
    vatNumber: '',
    iban: '',
    contactEmail: row.contact_email ?? '',
    contactPhone: row.contact_phone ?? '',
    city: row.city,
    address: '',
    category: DB_TO_STORE_CATEGORY[row.primary_category] ?? 'dresses',
    expectedVolume: 0,
    submittedAt: row.submitted_at,
    initials: deriveTextInitials(row.company_name),
    branches: [],
    docs: {
      commercialReg: 'pending',
      vat: 'pending',
      bankLetter: 'pending',
      authorizedId: 'pending',
    },
    notes: row.notes ?? undefined,
    decision: {
      status: row.status,
      decidedAt: row.decided_at ?? row.submitted_at,
      notes: row.decision_notes ?? undefined,
      reviewer: undefined,
    },
  };
}
