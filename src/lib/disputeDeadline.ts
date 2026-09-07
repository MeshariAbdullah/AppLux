// =====================================================================
// Customer response deadline — display-state derivation shared by the
// customer, merchant, and admin dispute screens (20260502125400).
//
// The SERVER is authoritative (the sweeper escalates and the RPCs
// refuse late responses with P0212); this helper only decides what the
// UI shows between sweeps, the same clock-derivation pattern the offer
// expiry uses. Dependency-free so it bundles standalone for Node tests.
// =====================================================================

export type CustomerDeadlineState =
  /** No deadline applies (legacy row, or the case is past the
   *  awaiting-customer phase without a recorded non-response). */
  | 'none'
  /** Awaiting the customer; the 48h window is still open. */
  | 'active'
  /** Window passed, sweeper hasn't stamped the record yet — responses
   *  are already refused server-side (P0212). */
  | 'expired'
  /** Non-response documented; the case moved to Lend review. */
  | 'recorded';

export type DeadlineCaseLike = {
  dispute_phase: string;
  customer_response_deadline?: string | null;
  customer_no_response_recorded_at?: string | null;
};

export function customerDeadlineState(
  kase: DeadlineCaseLike,
  nowMs: number,
): CustomerDeadlineState {
  if (kase.customer_no_response_recorded_at) return 'recorded';
  if (kase.dispute_phase !== 'awaiting_customer') return 'none';
  const deadline = kase.customer_response_deadline;
  if (!deadline) return 'none'; // legacy case without a deadline
  const t = new Date(deadline).getTime();
  if (!Number.isFinite(t)) return 'none';
  return nowMs < t ? 'active' : 'expired';
}
