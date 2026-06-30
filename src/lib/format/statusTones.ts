import type { StatusTone } from '@/components/ui';
import type {
  AdminCaseSeverity,
  AdminCaseStage,
  AdminMerchantDecisionStatus,
  AdminOverdueBucket,
  AdminUserStatus,
  MerchantDamageSeverity,
  MerchantDamageStatus,
  MerchantRentalStatus,
} from '@/lib/data';

// =====================================================================
// Status → StatusTone mappings.
// =====================================================================
// Each of the helpers below was inlined as a local `toneFor*` /
// `statusTone` / `severityTone` / `stageTone` / `bucketTone` in 2+
// page files. The Phase 1 audit confirmed every duplicate is
// behavior-identical to its sibling(s); these definitions are the
// canonical copy.
//
// One-off tone helpers (used in exactly one page) are deliberately
// LEFT in place to minimise blast radius for this pass:
//   * MerchantApprovals.toneForStage     (only consumer)
//   * MerchantHistoryPage.toneForOutcome (only consumer)
//   * MerchantRentalDetails.toneForDocState + toneForNafith (only consumer)
//   * AdminUserDetails.riskTone           (only consumer)
// =====================================================================

/** Used in: MerchantDamages, MerchantDamageDetails. */
export function damageStatusTone(s: MerchantDamageStatus): StatusTone {
  if (s === 'settled') return 'success';
  if (s === 'investigating') return 'warn';
  return 'danger';
}

/**
 * Used in: MerchantDamages, MerchantDamageDetails. The two original
 * sites used opposite phrasings ('partial → warn, else → danger' vs
 * 'total||non-return → danger, else → warn') but both produced the
 * same StatusTone for every enum value. Canonicalised here as the
 * "partial → warn, else → danger" form.
 */
export function damageSeverityTone(s: MerchantDamageSeverity): StatusTone {
  if (s === 'partial') return 'warn';
  return 'danger';
}

/** Used in: MerchantRentals, MerchantRentalDetails. */
export function rentalStatusTone(status: MerchantRentalStatus): StatusTone {
  if (status === 'overdue') return 'danger';
  if (status === 'due-soon') return 'warn';
  if (status === 'returned') return 'neutral';
  return 'success';
}

/** Used in: AdminUsers, AdminUserDetails. */
export function adminUserStatusTone(s: AdminUserStatus): StatusTone {
  if (s === 'active') return 'success';
  if (s === 'pending') return 'warn';
  return 'danger';
}

/** Used in: AdminMerchants, AdminMerchantDetails. */
export function adminMerchantDecisionTone(s: AdminMerchantDecisionStatus): StatusTone {
  if (s === 'approved') return 'success';
  if (s === 'rejected') return 'danger';
  return 'warn';
}

/** Used in: AdminCases, AdminCaseDetails, AdminHome. */
export function caseSeverityTone(s: AdminCaseSeverity): StatusTone {
  if (s === 'partial') return 'warn';
  return 'danger';
}

/** Used in: AdminCases, AdminCaseDetails, AdminHome. */
export function caseStageTone(s: AdminCaseStage): StatusTone {
  if (s === 'review') return 'brand';
  if (s === 'settlement') return 'gold';
  if (s === 'nafith') return 'warn';
  return 'danger';
}

/**
 * Used in: AdminCases, AdminHome. The AdminCases version returned
 * 'warn' for ['1-7', '8-30'] and 'danger' otherwise. The AdminHome
 * version checked each of the four buckets but produced the same
 * mapping. Canonicalised to the shorter form.
 */
export function overdueBucketTone(b: AdminOverdueBucket): StatusTone {
  if (b === '1-7' || b === '8-30') return 'warn';
  return 'danger';
}
