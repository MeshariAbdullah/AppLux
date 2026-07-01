-- =====================================================================
-- Default customer eligibility on signup
-- =====================================================================
-- Business rule: every new customer account should land with an
-- "active" rental eligibility — a `rental_eligibility` row with a
-- 100,000 SAR limit and 0 used. Today the handle_new_auth_user
-- trigger only writes the `profiles` row, so a new customer opens
-- the app and sees "غير مفعل / not active" until an admin manually
-- assigns a limit. That's not the intended v1 behaviour.
--
-- What this migration does:
--   1. Extends the handle_new_auth_user trigger to ALSO insert a
--      rental_eligibility row for the newly-created profile.
--      Idempotent — `on conflict (user_id) do nothing` protects
--      against duplicate inserts if the migration is re-run or the
--      trigger is re-triggered on the same auth row.
--   2. Backfills existing customer profiles that currently have no
--      eligibility row, giving them the same (100000, 0) default.
--      Suspended customers are DELIBERATELY excluded — they've been
--      blocked by an admin and must not be silently reactivated.
--   3. Rows that already exist are NEVER overwritten. Existing
--      `used_amount` values are preserved.
--
-- What this migration does NOT do:
--   * Change merchant or admin account creation. Both roles start
--     life as `role = 'customer'` (per the initial-schema default),
--     so the trigger writes them an eligibility row too — that row
--     stays untouched when they're later provisioned to merchant
--     via provision_merchant_from_application. Cosmetic-only.
--   * Change the rental / contract / payment / Nafath / Nafith /
--     promissory note flow. None of those RPCs are touched.
--   * Change `profiles.account_status`. The trigger continues to
--     leave that at its 'pending' default; whatever downstream
--     activates it is unchanged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Extend the handle_new_auth_user trigger
-- ---------------------------------------------------------------------
-- Keeps every existing behaviour from the previous version
-- (20260502121900_persist_national_id_on_signup.sql) and adds a
-- second insert against rental_eligibility. Both inserts are safe
-- to re-run.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, mobile, national_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    public.canonicalize_saudi_mobile(
      nullif(new.raw_user_meta_data->>'mobile', '')
    ),
    nullif(new.raw_user_meta_data->>'national_id', '')
  )
  on conflict (id) do nothing;

  -- Default rental eligibility: 100,000 SAR limit, 0 used, standard
  -- tier. If a row already exists (retriggered / backfilled / seeded)
  -- we do nothing — never overwrite used_amount.
  insert into public.rental_eligibility (
    user_id, limit_amount, used_amount, tier
  )
  values (new.id, 100000, 0, 'standard')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (2) Backfill existing customers
-- ---------------------------------------------------------------------
-- Insert an eligibility row for every customer profile that:
--   * has role = 'customer'   (skip merchants + admins)
--   * has account_status <> 'suspended'
--     (a suspended customer was intentionally blocked by an admin —
--      do NOT silently reactivate them; if they had usage before
--      being suspended, their existing row is untouched below.)
--   * does NOT already have a rental_eligibility row
--     (never overwrite an existing used_amount or limit)
--
-- SQL naturally satisfies "never overwrite" via the `not exists`
-- correlated subquery — no ON CONFLICT clause is needed here.
insert into public.rental_eligibility (
  user_id, limit_amount, used_amount, tier
)
select p.id, 100000, 0, 'standard'
from public.profiles p
where p.role = 'customer'
  and p.account_status <> 'suspended'
  and not exists (
    select 1
    from public.rental_eligibility e
    where e.user_id = p.id
  );
