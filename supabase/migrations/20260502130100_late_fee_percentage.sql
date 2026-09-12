-- =====================================================================
-- Late-return fee: percentage-of-rental-price mode (+ audit fix)
-- =====================================================================
-- AUDIT (real-device report — "why 450?"): the late fee had two modes,
-- 'fixed' and 'multiplier' (per-late-day = daily rate ×
-- late_return_multiplier). The wizard PRE-FILLED the multiplier with
-- 1.50 and the resolver injected the same default for absent values,
-- so a 300 SAR/day rental silently produced 300 × 1.5 = 450 SAR/day —
-- a number the merchant never consciously chose, derived from a
-- hidden default rather than an explicit rule.
--
-- BUSINESS RULE (new): exactly two configurable modes for NEW offers —
--   fixed      → late_fee_fixed_amount SAR per late day (existing)
--   percentage → per-late-day = rental price × the merchant's percent.
--                Stored as a FRACTION in the existing
--                late_return_multiplier column (0.20 = 20%), so no new
--                column is needed and the (>0, ≤10) base check from
--                20260502121400 still applies; this migration adds the
--                tighter (0,1] bound for percentage rows.
-- 'multiplier' remains VALID ONLY for rows issued before this change,
-- so their contracts keep rendering the terms the customer accepted.
-- Percentage-of-rental-price is well-defined under BOTH pricing
-- models, so the total-pricing restriction now allows it too.
--
-- Item value is deliberately NOT part of any late-fee formula.
-- Idempotent; constraint re-declarations only. ROLLBACK: restore the
-- two 20260502125300 constraint bodies.
-- =====================================================================

alter table public.rental_invoices
  drop constraint if exists rental_invoices_late_fee_type_check;
alter table public.rental_invoices
  add constraint rental_invoices_late_fee_type_check
  check (late_fee_type in ('multiplier', 'fixed', 'percentage'));

-- Percentage rows: the stored fraction must be an explicit rate in
-- (0, 1] — zero/absent is never silently accepted for this mode.
alter table public.rental_invoices
  drop constraint if exists rental_invoices_late_percentage_bounds;
alter table public.rental_invoices
  add constraint rental_invoices_late_percentage_bounds
  check (
    late_fee_type <> 'percentage'
    or (late_return_multiplier > 0 and late_return_multiplier <= 1)
  );

-- Total pricing: no daily rate exists, so the DAILY-RATE multiplier
-- stays forbidden — but fixed and percentage-of-rental-price are both
-- well-defined.
alter table public.rental_invoices
  drop constraint if exists rental_invoices_total_pricing_requires_fixed_late_fee;
alter table public.rental_invoices
  add constraint rental_invoices_total_pricing_requires_fixed_late_fee
  check (pricing_type <> 'total' or late_fee_type in ('fixed', 'percentage'));

comment on column public.rental_invoices.late_fee_type is
  'How the per-late-day fee is defined: percentage (rental price × late_return_multiplier-as-fraction), fixed (late_fee_fixed_amount SAR per late day), or multiplier (LEGACY pre-20260502130100 rows: daily rate × late_return_multiplier — kept only so historical contracts render their accepted terms).';
comment on column public.rental_invoices.late_return_multiplier is
  'Late-fee rate. For late_fee_type=percentage: the FRACTION of the rental price per late day (0.20 = 20%, bounded (0,1]). For legacy multiplier rows: the × of the daily rate. Ignored for fixed rows.';

notify pgrst, 'reload schema';
