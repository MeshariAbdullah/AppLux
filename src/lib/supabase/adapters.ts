// Adapters that map Supabase DB rows to the existing UI types,
// so screens can switch data sources without changing their render code.

import type {
  AdminActiveCase,
  AdminCaseSeverity,
  AdminCaseStage,
  AdminUserRecord,
  AdminUserStatus,
  Contract,
  ContractStatus as UIContractStatus,
  HistoryItem,
  Invoice,
  InvoiceStatus as UIInvoiceStatus,
  Localized,
  MerchantRental,
  MerchantRentalCategory,
  MerchantRentalStatus,
  NoteStatus as UINoteStatus,
  PartnerStore,
  PromissoryNote,
  RentalEligibility,
  ScannedItem,
  ScannedPackage,
  StoreBranch,
  StoreCategory,
} from '@/lib/data';
import type { AdminMerchantRequest } from '@/lib/store';
import type {
  AccountStatus,
  ContractStatusDB,
  DamageCaseRow,
  DamageSeverity,
  DamageStage,
  InvoiceStatus as DBInvoiceStatus,
  MerchantApplicationRow,
  MerchantRow,
  NoteStatus as DBNoteStatus,
  ProfileRow,
  PromissoryNoteRow,
  RentalCategoryDB,
  RentalContractRow,
  RentalEligibilityRow,
  RentalInvoiceItemRow,
  RentalInvoiceRow,
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
    assignedBy: 'Lend',
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

// ---------------------------------------------------------------------
// Invoice / contract / note adapters → customer-facing UI types
// ---------------------------------------------------------------------

function mapInvoiceStatus(status: DBInvoiceStatus): UIInvoiceStatus {
  // The UI status set is narrower than the DB set:
  //   accepted/issued/viewed → 'due', cancelled/rejected/superseded → 'paid'
  //   (cancelled is rendered as 'paid' so it disappears from "due" lists)
  if (status === 'accepted') return 'paid';
  if (status === 'rejected' || status === 'cancelled' || status === 'superseded')
    return 'paid';
  return 'due';
}

function mapContractStatus(status: ContractStatusDB): UIContractStatus {
  if (status === 'cancelled') return 'ended';
  return status;
}

function mapNoteStatus(status: DBNoteStatus): UINoteStatus {
  if (status === 'settled') return 'signed';
  return status;
}

export function adaptInvoice(
  row: RentalInvoiceRow,
  items: RentalInvoiceItemRow[] = [],
  merchantName?: string,
): Invoice {
  const headline =
    items[0]?.item_name ??
    (row.notes ?? '').split('\n')[0] ??
    `Invoice ${row.invoice_number}`;
  return {
    id: row.id,
    title: headline,
    contractRef: row.invoice_number,
    issuedAt: row.issued_at ?? row.created_at,
    dueDate: row.expires_at ?? row.issued_at ?? row.created_at,
    amount: Number(row.total_amount),
    status: mapInvoiceStatus(row.status),
    counterparty: merchantName,
  };
}

export function adaptContract(
  row: RentalContractRow,
  merchantName?: string,
): Contract {
  return {
    id: row.id,
    title: `Rental ${row.contract_number}`,
    counterparty: merchantName ?? '—',
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyAmount: Number(row.rental_fee_amount),
    status: mapContractStatus(row.status),
    handoverPhotoPath: row.handover_photo_path,
    handoverAt: row.handover_at,
  };
}

export function adaptNote(
  row: PromissoryNoteRow,
  counterparty?: string,
): PromissoryNote {
  return {
    id: row.id,
    reference: row.reference_number,
    counterparty: counterparty ?? row.beneficiary_name,
    amount: Number(row.principal_amount),
    dueDate: row.due_date,
    status: mapNoteStatus(row.status),
  };
}

export function adaptContractToHistory(
  row: RentalContractRow,
  merchantName?: string,
): HistoryItem {
  return {
    id: row.id,
    title: `Rental ${row.contract_number}`,
    counterparty: merchantName ?? '—',
    closedAt: row.ended_at ?? row.end_date,
    amount: Number(row.total_amount),
    status: row.status === 'cancelled' ? 'cancelled' : 'completed',
  };
}

// ---------------------------------------------------------------------
// MerchantRental — operational view for the merchant side
// ---------------------------------------------------------------------

const DB_TO_RENTAL_CATEGORY: Record<RentalCategoryDB, MerchantRentalCategory> = {
  dress: 'dress',
  bag: 'bag',
  watch: 'watch',
  bisht: 'bisht',
};

function deriveRentalStatus(row: RentalContractRow): MerchantRentalStatus {
  if (row.status === 'ended' || row.status === 'cancelled') return 'returned';
  const today = new Date();
  const end = new Date(row.end_date);
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= 5) return 'due-soon';
  return 'active';
}

export function adaptContractToMerchantRental(
  row: RentalContractRow,
  ctx: {
    customerName?: string;
    customerInitials?: string;
    customerCity?: string;
    customerMobile?: string;
    headlineItem?: string;
    category?: RentalCategoryDB;
    noteRef?: string;
    itemValue?: number;
  } = {},
): MerchantRental {
  const status = deriveRentalStatus(row);
  return {
    id: row.id,
    customerName: ctx.customerName ?? '—',
    customerInitials: ctx.customerInitials ?? '—',
    customerCity: ctx.customerCity ?? '',
    customerMobile: ctx.customerMobile ?? '',
    item: ctx.headlineItem ?? `Rental ${row.contract_number}`,
    category: ctx.category ? DB_TO_RENTAL_CATEGORY[ctx.category] : 'dress',
    branchId: row.branch_id ?? '',
    startDate: row.start_date,
    endDate: row.end_date,
    nextDueDate: row.end_date,
    monthlyAmount: Number(row.rental_fee_amount),
    itemValue: ctx.itemValue ?? Number(row.total_amount),
    liabilityTotal: Number(row.total_amount),
    paidInstallments: 0,
    totalInstallments: 1,
    status,
    contractRef: row.contract_number,
    noteRef: ctx.noteRef ?? row.contract_number,
    customerApproved: row.status !== 'pending',
    contractState: row.signed_at ? 'signed' : 'sent',
    noteState: row.signed_at ? 'signed' : 'sent',
    nafithState: 'pending',
    timeline: [],
  };
}

// ---------------------------------------------------------------------
// Synthesize a ScannedPackage from a real invoice + items (+ optional
// merchant info). The Review flow uses this when configured so the
// existing rich review UI keeps rendering against real data.
// ---------------------------------------------------------------------

function dur(startIso: string, days: number): string {
  return new Date(new Date(startIso).getTime() + days * 86_400_000).toISOString();
}

export function synthesizePackageFromInvoice(
  invoice: RentalInvoiceRow,
  items: RentalInvoiceItemRow[],
  merchant?: MerchantRow | null,
): ScannedPackage {
  const issuedAt = invoice.issued_at ?? invoice.created_at;
  const headlineCategory = items[0]?.category ?? 'dress';
  const durationDays = items[0]?.rental_days ?? 30;
  const pickupDate = issuedAt;
  const returnDate = invoice.expires_at ?? dur(issuedAt, durationDays);
  const beneficiary = merchant
    ? localized(merchant.display_name)
    : { ar: 'Lend Partner', en: 'Lend Partner' };
  const cityLocalized = merchant
    ? { ar: merchant.city, en: merchant.city }
    : { ar: '—', en: '—' };

  return {
    token: invoice.scan_token ?? invoice.id,
    storeId: invoice.merchant_id,
    branchId: invoice.branch_id ?? '',
    issuedAt,
    currency: 'SAR',
    rental: {
      title: {
        ar: items[0]?.item_name ?? `قطعة ${headlineCategory}`,
        en: items[0]?.item_name ?? headlineCategory,
      },
      purpose: { ar: 'إيجار', en: 'Rental' },
      pickupDate,
      returnDate,
      durationDays,
      pickupLocation: cityLocalized,
    },
    items: items.map<ScannedItem>((it) => ({
      id: it.id,
      name: { ar: it.item_name, en: it.item_name },
      qty: it.rental_days,
      unitValue: Number(it.replacement_value ?? it.subtotal),
      serial: undefined,
      attributes:
        it.size_label || it.color
          ? [
              ...(it.size_label
                ? [{ label: { ar: 'المقاس', en: 'Size' }, value: { ar: it.size_label, en: it.size_label } }]
                : []),
              ...(it.color
                ? [{ label: { ar: 'اللون', en: 'Color' }, value: { ar: it.color, en: it.color } }]
                : []),
            ]
          : undefined,
    })),
    fees: {
      rentalTotal: Number(invoice.subtotal_amount),
      deposit: Number(invoice.security_deposit),
      insurance: 0,
      vat: Number(invoice.tax_amount),
      grandTotal: Number(invoice.total_amount),
    },
    damages: {
      nonReturn: items.reduce((s, it) => s + Number(it.replacement_value ?? 0), 0),
      partialDamage: 0,
      totalDamage: items.reduce((s, it) => s + Number(it.replacement_value ?? 0), 0),
      note: { ar: '', en: '' },
    },
    contract: {
      reference: invoice.invoice_number,
      clauses: [],
    },
    note: {
      reference: invoice.invoice_number,
      beneficiary,
      principal: Number(invoice.total_amount) + Number(invoice.security_deposit),
      dueDate: dur(issuedAt, 60),
      place: cityLocalized,
      purpose: { ar: 'تأجير', en: 'Rental' },
    },
  };
}

// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Admin: profile + eligibility → AdminUserRecord
// ---------------------------------------------------------------------

function mapAccountStatus(s: AccountStatus): AdminUserStatus {
  return s; // 'pending' | 'active' | 'suspended' aligns with both shapes
}

export function adaptUserRecord(
  profile: ProfileRow,
  eligibility?: RentalEligibilityRow | null,
  ctx: { activeRentals?: number; completedRentals?: number } = {},
): AdminUserRecord {
  const fullName = profile.full_name || profile.email || '—';
  return {
    id: profile.id,
    fullName,
    initials: deriveTextInitials(fullName),
    nationalId: profile.national_id ?? '',
    mobile: profile.mobile ?? '',
    email: profile.email ?? '',
    city: profile.city ?? '',
    status: mapAccountStatus(profile.account_status),
    nafathVerified: Boolean(profile.nafath_verified_at),
    createdAt: profile.created_at,
    lastActiveAt: profile.updated_at,
    eligibilityLimit: Number(eligibility?.limit_amount ?? 0),
    usedAmount: Number(eligibility?.used_amount ?? 0),
    activeRentals: ctx.activeRentals ?? 0,
    completedRentals: ctx.completedRentals ?? 0,
    riskTier: 'standard',
    activity: [],
  };
}

// ---------------------------------------------------------------------
// Admin: damage_cases → AdminActiveCase
// ---------------------------------------------------------------------

function mapCaseSeverity(s: DamageSeverity): AdminCaseSeverity {
  return s === 'non_return' ? 'non-return' : s;
}
function mapCaseStage(s: DamageStage): AdminCaseStage {
  return s;
}

export function adaptDamageCase(
  row: DamageCaseRow,
  ctx: {
    merchantName?: string;
    customerName?: string;
    customerInitials?: string;
    headlineItem?: string;
  } = {},
): AdminActiveCase {
  return {
    id: row.id,
    merchantName: ctx.merchantName ?? '—',
    customerName: ctx.customerName ?? '—',
    customerInitials: ctx.customerInitials ?? '—',
    item: ctx.headlineItem ?? `Case ${row.case_number}`,
    severity: mapCaseSeverity(row.severity),
    stage: mapCaseStage(row.stage),
    claimAmount: Number(row.claim_amount),
    reportedAt: row.raised_at,
  };
}

// ---------------------------------------------------------------------

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
