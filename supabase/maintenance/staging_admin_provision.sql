-- =====================================================================
-- STAGING-ONLY administrator provisioning (lend-test) — Package 2
-- =====================================================================
-- PURPOSE
--   Promote exactly ONE existing staging auth account (created by the
--   project owner, with a real mailbox the owner controls) to the
--   'admin' role. Admin powers in LEND come solely from
--   profiles.role = 'admin' (is_admin() reads it; RLS admin policies
--   and admin RPCs all gate on that). No database-level privileges are
--   granted, no RLS is changed, and no credentials appear anywhere in
--   this script.
--
-- OWNER ACTIONS BEFORE RUNNING (no passwords ever shared):
--   1. Supabase Dashboard → project lend-test (hdwqavrwjwfgtdyjemfz;
--      remember: the project NAMED "lend-staging" is LIVE PRODUCTION —
--      do not touch it) → Authentication → Users → "Invite user".
--      Enter the owner-controlled admin mailbox. Supabase emails an
--      invite link; the owner opens it and sets their own password
--      (never typed into chat, SQL, or logs). Alternatively use
--      "Send magic link" / "Send password recovery" for the same
--      effect. The signup trigger auto-creates the profile row
--      (role 'customer') and a default eligibility row.
--   2. Replace the placeholder email in the ONE line below.
--   3. Paste this WHOLE file into the lend-test SQL Editor and run it
--      once. Any failed gate aborts with nothing changed.
--
-- WHAT IT DOES (and nothing else):
--   * profiles.role            customer → admin
--   * profiles.account_status  → active
--   * rental_eligibility.limit_amount → 0 for this account (an
--     administrator is not a rental customer; this prevents the
--     default 100,000 SAR customer limit from lingering on an
--     admin account).
--
-- WHAT IT REFUSES:
--   * running outside the staging-marked database;
--   * promoting any *@lend.test fictional seed or any account that
--     has rental history (invoices or contracts);
--   * promoting a merchant;
--   * running when the target does not exist or is already admin.
-- =====================================================================

begin;

do $provision$
declare
  -- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  v_email text := 'REPLACE_WITH_OWNER_ADMIN_MAILBOX@example.com';
  -- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  v_env  text;
  v_uid  uuid;
  v_role text;
begin
  begin
    select env into v_env from public.environment_marker limit 1;
  exception when undefined_table then
    v_env := null;
  end;
  if v_env is distinct from 'staging' then
    raise exception 'ABORT: environment_marker is % — staging (lend-test) only.',
      coalesce(v_env, 'MISSING');
  end if;

  if v_email ilike '%@lend.test' or v_email ilike 'REPLACE_WITH%' then
    raise exception 'ABORT: % is not a valid owner mailbox for the admin account.', v_email;
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(v_email);
  if v_uid is null then
    raise exception 'ABORT: no auth user with email % — complete the Dashboard invite first.', v_email;
  end if;

  select p.role::text into v_role from public.profiles p where p.id = v_uid;
  if v_role is null then
    raise exception 'ABORT: auth user % has no profile row (signup trigger did not run?).', v_email;
  end if;
  if v_role = 'admin' then
    raise exception 'ABORT: % is already an administrator — nothing to do.', v_email;
  end if;
  if v_role = 'merchant' then
    raise exception 'ABORT: % is a merchant account — use a dedicated admin mailbox.', v_email;
  end if;

  if exists (select 1 from public.rental_invoices where customer_user_id = v_uid)
     or exists (select 1 from public.rental_contracts where customer_user_id = v_uid) then
    raise exception 'ABORT: % has rental history — use a dedicated admin mailbox.', v_email;
  end if;

  update public.profiles
     set role = 'admin', account_status = 'active', updated_at = now()
   where id = v_uid;

  update public.rental_eligibility
     set limit_amount = 0, updated_at = now()
   where user_id = v_uid;

  raise notice 'OK: % promoted to admin (profile %).', v_email, v_uid;
end $provision$;

commit;

-- Validation — read-only; both rows must say OK.
with target as (
  select p.id, p.role::text as role, p.account_status
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'admin'
)
select 'admin count (expect exactly 1)' as item,
       count(*)::text as actual,
       case when count(*) = 1 then 'OK' else 'CHECK' end as ok
from target
union all
select 'admin eligibility limit zeroed',
       coalesce((select max(limit_amount)::text from public.rental_eligibility
                  where user_id in (select id from target)), 'no row'),
       case when coalesce((select max(limit_amount) from public.rental_eligibility
                            where user_id in (select id from target)), 0) = 0
            then 'OK' else 'CHECK' end;
