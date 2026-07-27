// Adapters that map Supabase DB rows to the existing UI types,
// so screens can switch data sources without changing their render code.

import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
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
  MerchantNafithState,
  MerchantRental,
  MerchantRentalCategory,
  MerchantRentalDocState,
  MerchantRentalStatus,
  MerchantRentalTimelineEvent,
  NoteStatus as UINoteStatus,
  PartnerStore,
  PromissoryNote,
  RentalEligibility,
  ScannedItem,
  ScannedPackage,
  StoreBranch,
  StoreCategory,
} from '@/lib/data';
import { buildContractFromTemplate } from '@/lib/contractTemplate';
import { LEND_PLATFORM_NAME } from '@/lib/platformIdentity';
import arLocale from '@/locales/ar.json';
import enLocale from '@/locales/en.json';
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
    // Document date for sorting/labels — NEVER an expiry (the old
    // `expires_at ?? …` fallback painted fake expiry copy).
    dueDate: row.issued_at ?? row.created_at,
    expiresAt: row.expires_at,
    amount: Number(row.total_amount),
    // Offer-decision lifecycle: an EXPIRED issued/viewed offer is no
    // longer actionable — map it out of the 'due' bucket so home,
    // contracts, and pending counts stop treating it as pending.
    status:
      (row.status === 'issued' || row.status === 'viewed') &&
      row.expires_at !== null &&
      new Date(row.expires_at).getTime() <= Date.now()
        ? 'paid'
        : mapInvoiceStatus(row.status),
    counterparty: merchantName,
    scanToken: row.scan_token,
  };
}

export function adaptContract(
  row: RentalContractRow,
  merchantName?: string,
  /** Real headline item name (invoice items). When absent the title
   *  falls back to the REAL contract reference — never the old
   *  fabricated English "Rental CN-…" label. */
  itemTitle?: string | null,
): Contract {
  return {
    id: row.id,
    title: itemTitle?.trim() || row.contract_number,
    counterparty: merchantName ?? '—',
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyAmount: Number(row.rental_fee_amount),
    status: mapContractStatus(row.status),
    handoverPhotoPath: row.handover_photo_path,
    handoverAt: row.handover_at,
    receiptPhotosConfirmedAt: row.receipt_photos_confirmed_at,
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
  /** Real headline item name — same rule as adaptContract. */
  itemTitle?: string | null,
): HistoryItem {
  return {
    id: row.id,
    title: itemTitle?.trim() || row.contract_number,
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
    /** Linked promissory note row. Without this the adapter falls
     *  back to safe defaults (nafith=pending, empty timeline) — that
     *  was the source of the merchant detail page showing the Nafath
     *  section as pending even when the rental was fully active.
     *  Pass the actual note (or null) so noteState / nafithState /
     *  timeline reflect the real DB state. */
    note?: PromissoryNoteRow | null;
  } = {},
): MerchantRental {
  const status = deriveRentalStatus(row);
  const note = ctx.note;

  // Contract is "signed" once contract.signed_at is set. In the
  // lifecycle-split flow that happens in verify_and_activate_rental
  // (T4), i.e. once Lend has verified the customer's Nafath approval.
  const contractState: MerchantRentalDocState = row.signed_at ? 'signed' : 'sent';

  // Note state reads the promissory_notes row directly. Settled is
  // shown as 'signed' here because the merchant-facing semantics are
  // "the note is in force"; settled means it's been satisfied.
  const noteState: MerchantRentalDocState = !note
    ? 'draft'
    : note.status === 'signed' || note.status === 'settled'
      ? 'signed'
      : 'sent';

  // Nafath: only 'approved' when the platform has recorded a real
  // attestation timestamp. 'submitted' covers the window between the
  // customer signing in Nafath and Lend verifying.
  const nafithState: MerchantNafithState = note?.nafith_attested_at
    ? 'approved'
    : note?.status === 'signed'
      ? 'submitted'
      : 'pending';

  // "customerApproved" semantically means "the rental is past all
  // customer steps and live" (post-Nafath verification). Pending
  // contracts have an approved customer but are not yet live.
  const customerApproved = row.status === 'active' || row.status === 'ended';

  // Synthesize a timeline from the real timestamps we have. Skipped
  // entries (e.g. note not yet created) are simply absent, so
  // downstream consumers can sort + render whatever is present.
  const timeline: MerchantRentalTimelineEvent[] = [];
  if (row.created_at) {
    timeline.push({ key: 'created', at: row.created_at });
    // In the lifecycle-split flow, contract row creation == customer
    // approval == contract document being ready (all the same moment).
    timeline.push({ key: 'customer-approved', at: row.created_at });
    timeline.push({ key: 'contract-ready', at: row.created_at });
  }
  // Payment / note / Nafith timeline events are hidden in the current
  // phase (ENABLE_PAYMENTS_AND_NOTES = false) — the simplified journey
  // has no such visible steps. Restored by flipping the flag.
  if (ENABLE_PAYMENTS_AND_NOTES) {
    if (note?.created_at) {
      timeline.push({ key: 'payment-received', at: note.created_at });
      timeline.push({ key: 'note-ready', at: note.created_at });
    }
    if (note?.signed_at) {
      timeline.push({ key: 'nafith-submitted', at: note.signed_at });
    }
    if (note?.nafith_attested_at) {
      timeline.push({ key: 'nafith-approved', at: note.nafith_attested_at });
    }
  }
  if (row.signed_at) {
    timeline.push({ key: 'activated', at: row.signed_at });
  }
  if (row.ended_at) {
    timeline.push({ key: 'returned', at: row.ended_at });
  }

  // When the contract is in a final state (ended / cancelled) the
  // UI needs a truthy closureStatus so its "active" branches (Close
  // + Damage buttons, direct-navigation guards on those pages) fall
  // through to the read-only path. The demo store already populates
  // this field; the live adapter was missing it — bug source for
  // "closed rental still shows Close/Damage buttons."
  const closureStatus =
    row.status === 'ended' || row.status === 'cancelled' ? 'closed' : undefined;
  const closedAt = row.ended_at ?? null;

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
    // Item value = the piece's underlying value (eligibility hold +
    // promissory note principal), NOT the rental fee. The contract row
    // mirrors invoices.original_item_value at signing; legacy rows
    // predating that column fall back to total_amount. ctx.itemValue
    // remains for callers with a better source (e.g. items[0]
    // replacement_value on the contract page).
    itemValue:
      ctx.itemValue ??
      (Number(row.original_item_value) || Number(row.total_amount)),
    liabilityTotal: Number(row.total_amount),
    paidInstallments: 0,
    totalInstallments: 1,
    status,
    closureStatus,
    closedAt: closedAt ?? undefined,
    contractRef: row.contract_number,
    noteRef: ctx.noteRef ?? note?.reference_number ?? row.contract_number,
    customerApproved,
    contractState,
    noteState,
    nafithState,
    timeline,
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

/** Localized city display names, sourced from the SAME locale files
 *  the rest of the app renders (single source of truth — no duplicated
 *  strings). Unknown keys fall back to the raw value rather than
 *  inventing anything. */
function localizedCity(cityKey: string | null | undefined): Localized {
  if (!cityKey) return { ar: '—', en: '—' };
  const arCities = (arLocale as { register?: { cities?: Record<string, string> } })
    .register?.cities;
  const enCities = (enLocale as { register?: { cities?: Record<string, string> } })
    .register?.cities;
  return {
    ar: arCities?.[cityKey] ?? cityKey,
    en: enCities?.[cityKey] ?? cityKey,
  };
}

export function synthesizePackageFromInvoice(
  invoice: RentalInvoiceRow,
  items: RentalInvoiceItemRow[],
  merchant?: MerchantRow | null,
  /** Real pickup branch (merchant_branches row via the public-select
   *  policy). When present the customer sees the ACTUAL branch the
   *  merchant issued from, not a city fallback. */
  branch?: {
    name: { ar?: string; en?: string } | null;
    city: string;
    address: { ar?: string; en?: string } | null;
    hours_open?: string | null;
    hours_close?: string | null;
  } | null,
): ScannedPackage {
  const issuedAt = invoice.issued_at ?? invoice.created_at;
  const headlineCategory = items[0]?.category ?? 'dress';
  // Duration mirrors accept_rental_invoice exactly: max(rental_days)
  // across the invoice items, defaulting to 30 — so the period shown
  // at review equals the contract period created at acceptance.
  const durationDays = items.length
    ? Math.max(...items.map((it) => it.rental_days || 0)) || 30
    : 30;
  // Rental period = the merchant-chosen start (rental_invoices
  // .starts_at, set in the issuance wizard) — NOT the issuance moment
  // — and the return date derives from that start + duration, exactly
  // like the contract's end_date. expires_at is the OFFER expiry and
  // is never a rental date.
  const pickupDate = invoice.starts_at ?? issuedAt;
  const returnDate = dur(pickupDate, durationDays);
  // Note beneficiary is the platform legal entity, NOT the merchant.
  // Per the corrected product flow:
  //   * Contract  : merchant  ↔ renter   (the merchant IS a party)
  //   * Note      : platform  ↔ renter   (the merchant is NOT a party)
  const beneficiary: Localized = {
    ar: LEND_PLATFORM_NAME.ar,
    en: LEND_PLATFORM_NAME.en,
  };
  const cityLocalized = localizedCity(branch?.city ?? merchant?.city);
  // Pickup point: the REAL issuing branch when the invoice carries
  // one; otherwise the merchant's city as a translated display name —
  // never a raw city key, never an invented address.
  const pickupLocation: Localized = branch
    ? {
        ar: [branch.name?.ar ?? branch.name?.en, cityLocalized.ar]
          .filter(Boolean)
          .join(' · '),
        en: [branch.name?.en ?? branch.name?.ar, cityLocalized.en]
          .filter(Boolean)
          .join(' · '),
      }
    : cityLocalized;
  // Contract is auto-generated from a fixed template so the customer
  // sees the rental's real terms (period, damage policy, late return,
  // cancellation) inside the same review thread — not a disconnected
  // empty contract page.
  const contractTemplate = buildContractFromTemplate({
    invoice,
    items,
    merchant,
    pickupDate,
    returnDate,
    durationDays,
    branchHours: branch
      ? { open: branch.hours_open ?? null, close: branch.hours_close ?? null }
      : null,
  });

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
      pickupLocation,
    },
    items: items.map<ScannedItem>((it) => ({
      id: it.id,
      name: { ar: it.item_name, en: it.item_name },
      // The schema has no per-line quantity — each invoice item row is
      // ONE piece (rental_days is the DURATION, already shown in the
      // rental-details card; the old mapping displayed it as الكمية).
      qty: 1,
      // Market/original value = replacement_value ONLY. When the row
      // doesn't carry one, show the neutral unavailable state — never
      // substitute the rental fee (subtotal) as a market value.
      unitValue: it.replacement_value != null ? Number(it.replacement_value) : null,
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
    damages: contractTemplate.damages,
    contract: {
      reference: invoice.invoice_number,
      clauses: contractTemplate.clauses,
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
