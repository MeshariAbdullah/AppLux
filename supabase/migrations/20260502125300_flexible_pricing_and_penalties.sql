-- =====================================================================
-- Flexible pricing + penalty configuration on rental offers
-- =====================================================================
-- Some rental businesses price the whole transaction as one amount and
-- never define a daily rate. This migration lets the merchant choose,
-- per offer, on rental_invoices (the single source of contract terms —
-- light_damage_fraction / late_return_multiplier already live here and
-- every display goes through buildContractFromTemplate(invoice)):
--
--   pricing_type          'daily'  → subtotal = daily_rate × rental_days
--                                    (existing behavior, the default)
--                         'total'  → subtotal = merchant-entered total;
--                                    rental_days remains the DURATION
--                                    only and never derives the amount
--   damage_charge_type    'percentage' → light damage = item value ×
--                                        light_damage_fraction (existing)
--                         'fixed'      → light damage = damage_fixed_amount
--   late_fee_type         'multiplier' → per-late-day fee = daily rate ×
--                                        late_return_multiplier (existing)
--                         'fixed'      → per-late-day fee =
--                                        late_fee_fixed_amount
--
-- BACKWARD COMPATIBILITY: every existing row takes the defaults
-- ('daily' / 'percentage' / 'multiplier'), which reproduce today's
-- behavior exactly — old offers and contracts render unchanged, and
-- the client treats a missing column the same way. Amount columns
-- (subtotal/total on invoices, rental_fee_amount/total_amount frozen
-- on contracts at acceptance) are untouched, so accept_rental_invoice,
-- eligibility, and all lifecycle RPCs need no change.
--
-- INTEGRITY:
--   * fixed types must carry their amount (>= 0);
--   * 'total' pricing forbids the 'multiplier' late fee — there is no
--     daily rate to multiply, so only a fixed per-late-day amount is
--     coherent (the UI enforces the same rule).
--
-- Idempotent. ROLLBACK: drop the five columns + their constraints.
-- =====================================================================

alter table public.rental_invoices
  add column if not exists pricing_type          text not null default 'daily',
  add column if not exists damage_charge_type    text not null default 'percentage',
  add column if not exists damage_fixed_amount   numeric(12,2),
  add column if not exists late_fee_type         text not null default 'multiplier',
  add column if not exists late_fee_fixed_amount numeric(12,2);

alter table public.rental_invoices
  drop constraint if exists rental_invoices_pricing_type_check;
alter table public.rental_invoices
  add constraint rental_invoices_pricing_type_check
  check (pricing_type in ('daily', 'total'));

alter table public.rental_invoices
  drop constraint if exists rental_invoices_damage_charge_type_check;
alter table public.rental_invoices
  add constraint rental_invoices_damage_charge_type_check
  check (damage_charge_type in ('percentage', 'fixed'));

alter table public.rental_invoices
  drop constraint if exists rental_invoices_late_fee_type_check;
alter table public.rental_invoices
  add constraint rental_invoices_late_fee_type_check
  check (late_fee_type in ('multiplier', 'fixed'));

alter table public.rental_invoices
  drop constraint if exists rental_invoices_damage_fixed_amount_check;
alter table public.rental_invoices
  add constraint rental_invoices_damage_fixed_amount_check
  check (damage_fixed_amount is null or damage_fixed_amount >= 0);

alter table public.rental_invoices
  drop constraint if exists rental_invoices_late_fee_fixed_amount_check;
alter table public.rental_invoices
  add constraint rental_invoices_late_fee_fixed_amount_check
  check (late_fee_fixed_amount is null or late_fee_fixed_amount >= 0);

-- Fixed modes must carry their amount.
alter table public.rental_invoices
  drop constraint if exists rental_invoices_damage_fixed_requires_amount;
alter table public.rental_invoices
  add constraint rental_invoices_damage_fixed_requires_amount
  check (damage_charge_type <> 'fixed' or damage_fixed_amount is not null);

alter table public.rental_invoices
  drop constraint if exists rental_invoices_late_fixed_requires_amount;
alter table public.rental_invoices
  add constraint rental_invoices_late_fixed_requires_amount
  check (late_fee_type <> 'fixed' or late_fee_fixed_amount is not null);

-- Total pricing has no daily rate to multiply — late fee must be fixed.
alter table public.rental_invoices
  drop constraint if exists rental_invoices_total_pricing_requires_fixed_late_fee;
alter table public.rental_invoices
  add constraint rental_invoices_total_pricing_requires_fixed_late_fee
  check (pricing_type <> 'total' or late_fee_type = 'fixed');

comment on column public.rental_invoices.pricing_type is
  'How the rental amount was priced: daily (subtotal = daily_rate × rental_days, the legacy default) or total (merchant entered one total amount; rental_days is duration only).';
comment on column public.rental_invoices.damage_charge_type is
  'How the light-damage liability is defined: percentage (item value × light_damage_fraction, legacy default) or fixed (damage_fixed_amount SAR).';
comment on column public.rental_invoices.damage_fixed_amount is
  'Merchant-entered fixed light-damage amount (SAR). Required when damage_charge_type = fixed; ignored otherwise.';
comment on column public.rental_invoices.late_fee_type is
  'How the per-late-day fee is defined: multiplier (daily rate × late_return_multiplier, legacy default) or fixed (late_fee_fixed_amount SAR per late day).';
comment on column public.rental_invoices.late_fee_fixed_amount is
  'Merchant-entered fixed fee per late day (SAR). Required when late_fee_type = fixed; ignored otherwise.';

notify pgrst, 'reload schema';
