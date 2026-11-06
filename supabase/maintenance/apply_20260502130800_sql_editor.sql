-- =====================================================================
-- ONE-SHOT SQL-Editor apply of migration 20260502130800 (lend-test ONLY)
-- =====================================================================
-- Customer suspension enforcement: a suspended customer can neither
-- initiate nor enter new rental obligations (merchant lookup / OTP /
-- offer issuance, acceptance, receipt confirmation, handover,
-- activation) while keeping full access to view and resolve existing
-- contracts, offers and disputes. Enforced from the CURRENT
-- profiles.account_status at the data level (BEFORE triggers that fire
-- first on rental_invoices, rental_contracts, renter_otp_challenges)
-- plus early rejection in the two merchant entry points. Error code
-- P0101. No RLS policy, grant, existing row, session or Auth state is
-- changed.
--
-- Copy-paste this WHOLE file into the lend-test SQL Editor
-- (project ref hdwqavrwjwfgtdyjemfz — the project NAMED "lend-staging"
-- is LIVE PRODUCTION, never run this there) and run it once.
-- Structure (same safeguards as apply_20260502130400..130700):
--   1. fail-closed preflight: staging marker, exactly 68 prior history
--      rows (20260502120000..20260502130700), 130800 not yet applied —
--      any failure aborts before anything changes;
--   2. the committed migration SQL, verbatim;
--   3. the CLI-compatible history INSERT in the SAME transaction;
--   4. read-only post-execution checks (every row must say OK).
--
-- Data: this migration modifies NO rows. Customers already suspended
-- simply become subject to the rule on their next new-obligation
-- attempt; their existing contracts, offers and disputes are untouched.
-- Rollback is forward-fix only.
-- =====================================================================

begin;

do $preflight$
declare
  v_env  text;
  v_hist int;
  v_dup  int;
begin
  begin
    select env into v_env from public.environment_marker limit 1;
  exception when undefined_table then
    v_env := null;
  end;
  if v_env is distinct from 'staging' then
    raise exception
      'ABORT: environment_marker is % — this script may only run on the staging database (lend-test).',
      coalesce(v_env, 'MISSING');
  end if;

  select count(*) into v_hist
    from supabase_migrations.schema_migrations
   where version between '20260502120000' and '20260502130700';
  if v_hist <> 68 then
    raise exception
      'ABORT: expected 68 migration records (20260502120000..20260502130700), found %.', v_hist;
  end if;

  select count(*) into v_dup
    from supabase_migrations.schema_migrations
   where version = '20260502130800';
  if v_dup <> 0 then
    raise exception 'ABORT: migration 20260502130800 is already recorded as applied.';
  end if;

  raise notice 'Preflight OK: staging marker, 68 prior migrations intact, 130800 not yet applied.';
end $preflight$;

-- ---------------------------------------------------------------------
-- Migration 20260502130800 — verbatim
-- ---------------------------------------------------------------------
-- =====================================================================
-- Customer suspension enforcement (20260502130800)
-- =====================================================================
-- Product Owner decision (Package 2 readiness review):
--   "A suspended customer must NOT initiate or enter new rental
--    obligations, but must retain the ability to view and resolve
--    existing contractual obligations."
--
-- Before this migration profiles.account_status = 'suspended' had NO
-- effect on a customer: no RPC, trigger or policy consulted it, so a
-- suspended customer could still accept offers and activate rentals,
-- and merchants could still verify the customer and issue new offers
-- (verified read-only on staging before this fix).
--
-- Enforcement model — server-side, at the DATA level, from the CURRENT
-- profiles.account_status (never frontend state, never JWT claims):
--
--   assert_customer_active(p_user_id, p_action)      SECURITY DEFINER
--     Reads profiles.account_status FOR SHARE and raises SQLSTATE
--     P0101 when it is 'suspended'. The share lock orders every check
--     after an in-flight admin suspension (the admin's profiles UPDATE
--     holds the row lock): a lookup / issuance / acceptance /
--     activation racing the suspension waits for it to commit and then
--     evaluates the committed status. EXECUTE is revoked from anon /
--     authenticated — it runs only inside the definer functions and
--     triggers below and cannot be used to probe other accounts.
--
--   BEFORE triggers (named a0_ so they fire FIRST) on every table where
--   a new obligation or exposure is created, so the rule holds for
--   RPCs, direct PostgREST writes under RLS and any future workflow
--   alike (no bypass through an alternate path):
--     rental_invoices        offer entering issued/viewed (merchant
--                            issuance, incl. the wizard's direct
--                            insert) and offer entering accepted
--     rental_contracts       any new contract row (acceptance);
--                            pending → active (activation); receipt
--                            confirmation / handover evidence that
--                            advances a PENDING rental
--     renter_otp_challenges  merchant renter verification, the first
--                            step of a merchant-initiated rental
--
--   RPC-level early rejection on the two merchant entry points, so the
--   merchant is told BEFORE any side effect (no challenge row, no
--   notification, no SMS job): lookup_renter_by_mobile and
--   merchant_start_renter_otp. Every other new-exposure RPC
--   (accept_rental_invoice, confirm_contract_receipt_photos,
--   record_contract_handover, activate_rental_without_payment_and_note,
--   verify_and_activate_rental) is covered atomically by the triggers:
--   the rejected write rolls the whole RPC back, nothing partial
--   persists.
--
-- Deliberately NOT blocked (resolution of pre-existing obligations):
--   authentication and read access (RLS untouched); reject_rental_
--   invoice; request_contract_closure (return declaration / non-
--   handover) and the confirm / object paths; every dispute action
--   (customer_accept_claim, customer_object_to_claim, respond_to_
--   settlement_proposal, respond_to_lend_proposal, evidence uploads);
--   closure transitions (status → ended); anything on an ACTIVE
--   contract. A suspension never traps an active rental.
--
-- Unchanged: RLS policies, table grants, P0100 (guard_profile_
--   privileged_columns — only admins change account_status),
--   assert_merchant_active / P0110 (merchant enforcement), existing
--   contracts, eligibility rows and history. No row is modified.
--   Sessions are NOT revoked and no Auth ban is applied (PO decision).
--
-- Error contract: SQLSTATE P0101 (unused before this migration; the
-- client maps it to errors.customerSuspended). account_status is also
-- 'suspended' during the self-serve deletion grace window
-- (request_account_deletion) — the same rule applies there and
-- cancel_account_deletion restores the account.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reusable status helper
-- ---------------------------------------------------------------------
create or replace function public.assert_customer_active(
  p_user_id uuid,
  p_action  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.account_status;
begin
  if p_user_id is null then
    return;
  end if;

  -- FOR SHARE serializes this check against a concurrent admin UPDATE
  -- of the same profile row: a suspension in flight commits first and
  -- the committed status is what gets evaluated.
  select account_status
    into v_status
    from public.profiles
   where id = p_user_id
     for share;

  if v_status = 'suspended' then
    raise exception
      'Customer account is suspended — new rental obligations are not permitted (%)',
      coalesce(p_action, 'rental')
      using errcode = 'P0101';
  end if;
end;
$$;

revoke all on function public.assert_customer_active(uuid, text) from public;
revoke all on function public.assert_customer_active(uuid, text) from anon, authenticated;

comment on function public.assert_customer_active(uuid, text) is
  'Suspension gate (20260502130800): raises P0101 when profiles.account_status of the given customer is suspended. Reads the row FOR SHARE so the check is ordered after an in-flight admin suspension. Internal — not executable by anon/authenticated; called from the a0_guard_suspended_customer triggers and the merchant renter entry points.';

-- ---------------------------------------------------------------------
-- 2. Data-level guards (bypass-proof: RPCs, direct writes, future flows)
-- ---------------------------------------------------------------------
create or replace function public.guard_suspended_customer_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Offer ENTERING a customer-reviewable state = merchant issuance
  -- (same predicate as enforce_customer_eligibility). issued → viewed
  -- is not an entry, so a suspended customer can still open an offer
  -- to reject it.
  if new.status in ('issued', 'viewed')
     and (tg_op = 'INSERT' or old.status not in ('issued', 'viewed')) then
    perform public.assert_customer_active(new.customer_user_id, 'offer_issue');
  end if;

  -- Offer entering accepted = a new contractual obligation.
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform public.assert_customer_active(new.customer_user_id, 'offer_accept');
  end if;

  return new;
end;
$$;

drop trigger if exists rental_invoices_a0_guard_suspended_customer on public.rental_invoices;
create trigger rental_invoices_a0_guard_suspended_customer
  before insert or update of status on public.rental_invoices
  for each row execute function public.guard_suspended_customer_invoice();

comment on trigger rental_invoices_a0_guard_suspended_customer on public.rental_invoices is
  'Suspension gate (20260502130800): no offer may be issued to, or accepted by, a suspended customer. Fires first (a0) so the business error (P0101) wins over supersession/eligibility errors. Rejection, expiry, cancellation and supersession transitions are untouched.';

create or replace function public.guard_suspended_customer_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- A contract row is born at acceptance: a new obligation.
    perform public.assert_customer_active(new.customer_user_id, 'contract_create');
    return new;
  end if;

  -- Activation: pending → active commits exposure (used_amount).
  if new.status = 'active' and old.status is distinct from 'active' then
    perform public.assert_customer_active(new.customer_user_id, 'contract_activate');
  end if;

  -- Receipt confirmation / handover evidence that advances a PENDING
  -- rental towards activation. On an already ACTIVE contract nothing
  -- here fires — an active rental is never trapped.
  if old.status = 'pending' and (
       (new.receipt_photos_confirmed_at is not null and old.receipt_photos_confirmed_at is null)
    or (new.handover_at is not null and old.handover_at is null)
  ) then
    perform public.assert_customer_active(new.customer_user_id, 'contract_handover');
  end if;

  return new;
end;
$$;

drop trigger if exists rental_contracts_a0_guard_suspended_customer on public.rental_contracts;
create trigger rental_contracts_a0_guard_suspended_customer
  before insert or update of status, receipt_photos_confirmed_at, handover_at
  on public.rental_contracts
  for each row execute function public.guard_suspended_customer_contract();

comment on trigger rental_contracts_a0_guard_suspended_customer on public.rental_contracts is
  'Suspension gate (20260502130800): a suspended customer gets no new contract, no activation, and no receipt-confirmation/handover on a pending rental. Closure transitions (→ ended / cancelled) and every update of an active contract are untouched.';

create or replace function public.guard_suspended_customer_otp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_customer_active(new.customer_user_id, 'renter_verification');
  return new;
end;
$$;

drop trigger if exists renter_otp_challenges_a0_guard_suspended_customer on public.renter_otp_challenges;
create trigger renter_otp_challenges_a0_guard_suspended_customer
  before insert on public.renter_otp_challenges
  for each row execute function public.guard_suspended_customer_otp();

comment on trigger renter_otp_challenges_a0_guard_suspended_customer on public.renter_otp_challenges is
  'Suspension gate (20260502130800): no renter-verification challenge can be opened for a suspended customer (merchant-initiated rental session).';

-- ---------------------------------------------------------------------
-- 3. Merchant entry points — early rejection, before any side effect
-- ---------------------------------------------------------------------
-- lookup_renter_by_mobile: body unchanged except the gate. Declared
-- VOLATILE now (was STABLE) because the gate takes a row share lock;
-- the client calls it via POST, so nothing changes for callers.
create or replace function public.lookup_renter_by_mobile(p_mobile text)
returns table(id uuid, has_nafath boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      app_role;
  v_canonical text;
  v_customer  uuid;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can look up renters' using errcode = 'P0030';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return;
  end if;

  select p.id into v_customer
    from public.profiles p
   where p.mobile = v_canonical
     and p.role = 'customer'
   limit 1;

  -- Suspension gate (20260502130800): the merchant learns at the very
  -- first step that no rental session can be opened for this customer.
  if v_customer is not null then
    perform public.assert_customer_active(v_customer, 'renter_lookup');
  end if;

  return query
  select p.id, (p.nafath_verified_at is not null)
    from public.profiles p
   where p.id = v_customer;
end;
$$;

comment on function public.lookup_renter_by_mobile(text) is
  'Merchant renter lookup by Saudi mobile (existence + Nafath flag only). Raises P0101 when the matched customer is suspended (20260502130800) so no rental session starts for a suspended account.';

-- merchant_start_renter_otp: body unchanged except the gate, placed
-- right after the customer is resolved and BEFORE the throttle, the
-- challenge insert, the notification and any SMS dispatch.
create or replace function public.merchant_start_renter_otp(
  p_mobile   text,
  p_delivery text default 'inapp'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      app_role;
  v_canonical text;
  v_customer  uuid;
  v_code      text;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can start renter verification' using errcode = 'P0030';
  end if;

  if p_delivery not in ('inapp', 'sms') then
    raise exception 'Invalid delivery mode' using errcode = 'P0190';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    raise exception 'Invalid mobile format' using errcode = 'P0190';
  end if;

  -- profiles_mobile_customer_unique guarantees at most one match.
  select id into v_customer
    from public.profiles
   where mobile = v_canonical and role = 'customer';
  if v_customer is null then
    raise exception 'No customer account for this mobile' using errcode = 'P0191';
  end if;

  -- Suspension gate (20260502130800): refuse before any side effect.
  perform public.assert_customer_active(v_customer, 'renter_verification');

  -- Light throttle: at most one new challenge per merchant+customer
  -- every 15 seconds (double-tap / spam guard).
  if exists (
    select 1 from public.renter_otp_challenges
     where created_by = auth.uid()
       and customer_user_id = v_customer
       and created_at > now() - interval '15 seconds'
  ) then
    raise exception 'Verification code was just issued — wait a moment'
      using errcode = 'P0192';
  end if;

  -- Cryptographically random 6-digit code (pgcrypto). 24 random bits
  -- mod 1e6 — the residual modulo bias is negligible for a 5-attempt,
  -- 10-minute one-time code.
  v_code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(3), 'hex'))::bit(24)::int) % 1000000)::text,
    6, '0');

  -- Supersede any previous open (unverified, unused) challenge for
  -- this pair — exactly one code is live at a time.
  update public.renter_otp_challenges
     set superseded_at = now()
   where created_by = auth.uid()
     and customer_user_id = v_customer
     and verified_at is null
     and superseded_at is null;

  -- code_hash is the verification baseline; code_inapp is the
  -- TEMPORARY plaintext copy for in-app delivery (see table comment).
  insert into public.renter_otp_challenges
    (customer_user_id, mobile, code_hash, code_inapp, expires_at, created_by)
  values (
    v_customer,
    v_canonical,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    v_code,
    now() + interval '10 minutes',
    auth.uid()
  );

  -- In-app delivery: nudge the customer to open the app — exactly one
  -- notification (→ one push job) per created challenge, code-free.
  if p_delivery = 'inapp' then
    insert into public.notifications (user_id, type, merchant_display_name)
    values (
      v_customer,
      'renter_otp_ready',
      (select m.display_name from public.merchants m
        where m.owner_user_id = auth.uid() limit 1)
    );
  end if;
end;
$$;

comment on function public.merchant_start_renter_otp(text, text) is
  'Opens a renter-verification challenge for the customer registered under the mobile. Raises P0101 for a suspended customer before any side effect (20260502130800).';

-- PostgREST: function bodies/volatility changed; refresh the schema cache.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Record the migration (CLI-compatible; atomic with the change above)
-- ---------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
values ('20260502130800', 'customer_suspension_enforcement');

commit;

-- =====================================================================
-- Validation — read-only. Every row must say OK.
-- =====================================================================
with helper as (
  select p.oid, p.prosrc, p.prosecdef, p.provolatile
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assert_customer_active'
),
checks(ord, item, expected, actual) as (
  select 1, 'migration history now (68 + this one)', '69',
         (select count(*)::text from supabase_migrations.schema_migrations)
  union all
  select 2, '130800 recorded', '1',
         (select count(*)::text from supabase_migrations.schema_migrations
           where version = '20260502130800'
             and name = 'customer_suspension_enforcement')
  union all
  select 3, 'status helper present, security definer', 'true',
         (select coalesce(bool_and(prosecdef)::text, 'MISSING') from helper)
  union all
  select 4, 'status helper locks the profile row (race safety)', 'for share',
         (select case when prosrc ~* 'for share' then 'for share' else 'NO LOCK' end from helper)
  union all
  select 5, 'status helper internal (not executable by client roles)', 'internal',
         (select case when has_function_privilege('authenticated', oid, 'execute')
                        or has_function_privilege('anon', oid, 'execute')
                      then 'EXPOSED' else 'internal' end from helper)
  union all
  select 6, 'suspension guards bound (invoices, contracts, otp)', '3',
         (select count(*)::text from pg_trigger
           where tgname in ('rental_invoices_a0_guard_suspended_customer',
                            'rental_contracts_a0_guard_suspended_customer',
                            'renter_otp_challenges_a0_guard_suspended_customer'))
  union all
  select 7, 'suspension guards fire first on each table', '3',
         (select count(*)::text from (
            select c.relname, min(t.tgname) as first_trigger
              from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where not t.tgisinternal and (t.tgtype & 2) = 2
               and c.relname in ('rental_invoices', 'rental_contracts', 'renter_otp_challenges')
             group by c.relname) x
           where first_trigger = relname || '_a0_guard_suspended_customer')
  union all
  select 8, 'lookup_renter_by_mobile gated + volatile', 'gated',
         (select case when p.prosrc ~ 'assert_customer_active' and p.provolatile = 'v' then 'gated' else 'NOT GATED' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'lookup_renter_by_mobile')
  union all
  select 9, 'merchant_start_renter_otp gated', 'gated',
         (select case when p.prosrc ~ 'assert_customer_active' then 'gated' else 'NOT GATED' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'merchant_start_renter_otp')
  union all
  select 10, 'merchant entry points keep a single signature', 'p_mobile text | p_mobile text, p_delivery text',
         (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by p.proname)
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('lookup_renter_by_mobile', 'merchant_start_renter_otp'))
  union all
  select 11, 'P0100 privileged-column guard intact', 'intact',
         (select case when pg_get_triggerdef(oid) ~ 'old.account_status IS DISTINCT FROM new.account_status'
                        and pg_get_triggerdef(oid) ~ 'BEFORE UPDATE ON public.profiles'
                      then 'intact' else 'CHANGED' end
            from pg_trigger where tgname = 'profiles_guard_privileged_columns')
  union all
  select 12, 'RLS policy surface unchanged (profiles/invoices/contracts/otp)', '5/7/6/0',
         (select (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles')::text || '/' ||
                 (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rental_invoices')::text || '/' ||
                 (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rental_contracts')::text || '/' ||
                 (select count(*) from pg_policies where schemaname = 'public' and tablename = 'renter_otp_challenges')::text)
  union all
  select 13, 'table grants unchanged', 'unchanged',
         (select case when not has_table_privilege('authenticated', 'public.rental_contracts', 'insert')
                        and has_table_privilege('authenticated', 'public.rental_invoices', 'insert')
                        and not has_table_privilege('authenticated', 'public.renter_otp_challenges', 'select')
                      then 'unchanged' else 'CHANGED' end)
  union all
  select 14, 'Package 1 close path intact (single signature)', 'p_contract_id uuid, p_note text',
         (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'close_rental_contract')
  union all
  select 15, 'environment marker intact', 'staging',
         (select env from public.environment_marker limit 1)
)
select item, expected, actual,
       case when expected = actual then 'OK' else 'FAIL' end as ok
from checks order by ord;

-- Informational (not a check, no personal data): how many customer
-- accounts the rule applies to right now. No row was modified.
select count(*) as suspended_customers_now
  from public.profiles
 where role = 'customer' and account_status = 'suspended';
