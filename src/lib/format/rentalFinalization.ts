import type { MerchantRental } from '@/lib/data';

// =====================================================================
// isRentalFinalized — single source of truth for "no further merchant
// actions allowed on this rental."
//
// True when ANY of the following is set — belt-and-suspenders so a
// missing field in one part of the plumbing never allows the
// Close/Damage buttons to render on a completed rental:
//
//   * `closureStatus` is 'closed' or 'damaged' (adapter or demo store
//     populated), OR
//   * `status` is 'returned' (deriveRentalStatus maps DB status
//     'ended' + 'cancelled' → 'returned')
//
// Consumers:
//   - MerchantRentalDetails: hide Close + Damage action buttons; show
//     the finalizedBanner instead.
//   - MerchantRentalClose:    guard on mount and redirect back to
//     details if the rental is already finalised.
//   - MerchantDamageNew:      same guard.
// =====================================================================

export function isRentalFinalized(rental: MerchantRental): boolean {
  if (rental.closureStatus === 'closed' || rental.closureStatus === 'damaged') {
    return true;
  }
  if (rental.status === 'returned') {
    return true;
  }
  return false;
}
