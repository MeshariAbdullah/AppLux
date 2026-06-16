-- =====================================================================
-- Phase 8b — merchant-controlled contract overrides
-- =====================================================================
-- The contract content the customer sees is generated from a template
-- that takes a small number of inputs from the merchant (item value,
-- rental days, daily rate). Two values in that template were until
-- now hardcoded constants in the client:
--
--   * light damage   = 30% of the item value
--   * late return    = 1.5× the daily rate, per day overdue
--
-- This migration moves both into the merchant's hands by persisting
-- them on the rental_invoices row. The merchant adjusts them in the
-- new "Contract" step of the rental session before issuing the
-- package; the customer-side contract preview reads the same values
-- so what the merchant confirms is exactly what the customer sees.
--
-- Defaults preserved so existing rows keep their previous behaviour.
-- =====================================================================

alter table public.rental_invoices
  add column if not exists light_damage_fraction  numeric(4,3) not null default 0.300,
  add column if not exists late_return_multiplier numeric(4,2) not null default 1.50;

-- Sensible guardrails: light damage is a fraction in (0, 1]; late
-- return multiplier is a positive number with a soft upper cap so a
-- typo can't make the contract absurd.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rental_invoices_light_damage_fraction_check'
  ) then
    alter table public.rental_invoices
      add constraint rental_invoices_light_damage_fraction_check
        check (light_damage_fraction > 0 and light_damage_fraction <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rental_invoices_late_return_multiplier_check'
  ) then
    alter table public.rental_invoices
      add constraint rental_invoices_late_return_multiplier_check
        check (late_return_multiplier > 0 and late_return_multiplier <= 10);
  end if;
end $$;
