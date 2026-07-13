// =====================================================================
// Feature flags — plain compile-time constants (no env plumbing), per
// the approved journey-simplification decision. Flip + rebuild to
// restore a gated feature; the gated code is kept intact everywhere.
// =====================================================================

/**
 * Payments + promissory notes + Nafath/Nafith rental-flow UI.
 *
 * FALSE (current phase): the customer approves the offer/contract and
 * the rental activates immediately through
 * `activate_rental_without_payment_and_note` — no payment UI, no note
 * UI, no Nafath/Nafith steps, chips, timeline events, routes, or copy
 * anywhere in the customer or merchant journey. Note routes redirect
 * to their parent tracking/details pages.
 *
 * TRUE (future phase): restores the full simulated (or, later, real)
 * chain — payment sheet on Approval, note pages, note/nafith chips and
 * timeline events, and the 5/7-step journeys. The legacy RPCs
 * (record_rental_payment → record_nafath_signing →
 * verify_and_activate_rental) were never removed.
 *
 * Rollback pairing: see
 * supabase/migrations/20260502122400_activate_rental_without_payment_and_note.sql
 *
 * NOTE: the signup identity page at src/pages/auth/Nafath.tsx is
 * UNRELATED to this flag (identity verification, not rental flow) and
 * must not be gated by it.
 */
export const ENABLE_PAYMENTS_AND_NOTES = false;
