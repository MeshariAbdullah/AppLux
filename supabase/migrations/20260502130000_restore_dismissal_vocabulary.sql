-- =====================================================================
-- Repair: dismissal entries restored to the event/notification CHECKs
-- =====================================================================
-- AUDIT FINDING (raw-i18n-key sweep): 20260502124900 added
-- 'case_dismissed_by_lend' to dispute_events and 'dispute_dismissed'
-- to notifications, but the LATER re-declarations of those CHECK
-- constraints (20260502125400 for both, 20260502125700 for
-- notifications again) rebuilt the lists WITHOUT them. Consequences
-- once those migrations are applied:
--   * admin_dismiss_dispute_case fails (its event insert violates the
--     narrowed CHECK), breaking administrative closure;
--   * on a database that already contains a dismissed case, applying
--     the narrowed constraint itself fails validation.
-- No data is wrong — only the constraint lists. This migration
-- re-declares BOTH constraints as the COMPLETE union of every type
-- the product writes (124700 + 124900 + 125400 + 125700). Safe to
-- apply whether or not 125400/125700 are already in: it is a pure
-- widening, idempotent, and touches no rows.
--
-- Apply order: after 20260502125900 (or at minimum after 124900).
-- ROLLBACK: not needed — re-applying any previous list only narrows.
-- =====================================================================

alter table public.dispute_events drop constraint if exists dispute_events_event_type_check;
alter table public.dispute_events add constraint dispute_events_event_type_check
  check (event_type in (
    'claim_opened',
    'customer_response_deadline_set',
    'customer_accepted',
    'customer_objected',
    'evidence_added',
    'direct_proposal_submitted',
    'direct_proposal_accepted',
    'direct_proposal_rejected',
    'direct_round_exhausted',
    'customer_no_response_recorded',
    'moved_to_lend_mediation',
    'lend_proposal_submitted',
    'merchant_accepted_lend_proposal',
    'customer_accepted_lend_proposal',
    'lend_proposal_rejected',
    'dispute_resolved',
    'dispute_unresolved',
    'case_dismissed_by_lend'          -- restored (124900)
  ));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_issued',
  'renter_otp_ready',                 -- 125700
  'dispute_claim_submitted',
  'dispute_customer_accepted',
  'dispute_customer_objected',
  'dispute_proposal_received',
  'dispute_proposal_accepted',
  'dispute_proposal_rejected',
  'dispute_customer_no_response',     -- 125400
  'dispute_moved_to_lend',
  'dispute_lend_proposal',
  'dispute_resolved',
  'dispute_unresolved',
  'dispute_dismissed'                 -- restored (124900)
));

notify pgrst, 'reload schema';
