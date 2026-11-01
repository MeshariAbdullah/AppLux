-- =====================================================================
-- ONE-SHOT SQL-Editor apply of migration 20260502130500 (lend-test ONLY)
-- =====================================================================
-- Fixes the staging-found 42883 defect: customer acceptance failed
-- because next_contract_number() called pgcrypto's gen_random_bytes
-- unqualified under accept_rental_invoice's pinned search_path.
--
-- Copy-paste this WHOLE file into the lend-test SQL Editor and run it
-- once. Structure (same safeguards as apply_20260502130400):
--   1. fail-closed preflight: staging marker, 65 prior migration
--      records (20260502120000..20260502130400), 130500 not already
--      applied — any failure aborts before anything changes;
--   2. the exact committed migration SQL (CREATE OR REPLACE preserves
--      ownership, ACLs, security mode — no grants touched);
--   3. the CLI-compatible history INSERT in the SAME transaction;
--   4. read-only post-execution checks.
--
-- ROLLBACK/RECOVERY: to restore the previous (broken) definition,
-- re-run the function block from 20260502123200 and delete the
-- '20260502130500' history row — but note the previous definition is
-- exactly what fails on this project; the realistic recovery for a
-- bad apply is simply re-running this script's migration block.
-- Nothing here touches data, so no data recovery can be needed.
-- =====================================================================

begin;

do $$
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
   where version between '20260502120000' and '20260502130400';
  if v_hist <> 65 then
    raise exception
      'ABORT: expected 65 migration records (20260502120000..20260502130400), found %.', v_hist;
  end if;

  select count(*) into v_dup
    from supabase_migrations.schema_migrations
   where version = '20260502130500';
  if v_dup <> 0 then
    raise exception 'ABORT: migration 20260502130500 is already recorded as applied.';
  end if;

  raise notice 'Preflight OK: staging marker, 65 prior migrations intact, 130500 not yet applied.';
end $$;

-- ---------------------------------------------------------------------
-- Migration 20260502130500 — verbatim
-- ---------------------------------------------------------------------
create or replace function public.next_contract_number()
returns text
language plpgsql
volatile
as $$
declare
  -- Approved set: A-Z minus O/I/L, digits 2-9 → 31 chars.
  charset constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_byte int;
  v_try  int := 0;
  i      int;
begin
  loop
    v_try  := v_try + 1;
    v_code := 'LND-';
    for i in 1..6 loop
      -- Rejection sampling: accept only bytes < 248 (= 8 × 31) so
      -- every charset position is exactly equally likely.
      loop
        v_byte := get_byte(extensions.gen_random_bytes(1), 0);
        exit when v_byte < 248;
      end loop;
      v_code := v_code || substr(charset, 1 + (v_byte % 31), 1);
    end loop;

    exit when not exists (
      select 1 from public.rental_contracts where contract_number = v_code
    );

    if v_try >= 20 then
      -- 20 consecutive collisions is practically impossible at any
      -- realistic table size; fail loudly rather than loop forever.
      raise exception 'could not allocate a unique contract reference'
        using errcode = 'P0120';
    end if;
  end loop;
  return v_code;
end;
$$;

comment on function public.next_contract_number() is
  'Public contract reference generator: LND- + 6 secure-random chars from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no O/0/I/1/L). Pre-checks + retries on collision; rental_contracts.contract_number UNIQUE is the final guarantor. gen_random_bytes schema-qualified (20260502130500) so the SECURITY DEFINER accept path resolves it on schemas where pgcrypto lives in `extensions`.';

-- ---------------------------------------------------------------------
-- Record the migration (CLI-compatible; atomic with the fix above)
-- ---------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
values ('20260502130500', 'contract_reference_pgcrypto_fix');

commit;

-- =====================================================================
-- Validation — read-only. Every row must say OK.
-- =====================================================================
with checks(ord, item, expected, actual) as (
  select 1, 'migration history now (65 + this one)', '66',
         (select count(*)::text from supabase_migrations.schema_migrations)
  union all
  select 2, '130500 recorded', '1',
         (select count(*)::text from supabase_migrations.schema_migrations
           where version = '20260502130500' and name = 'contract_reference_pgcrypto_fix')
  union all
  select 3, 'definition schema-qualifies gen_random_bytes', 'qualified',
         (select case when position('extensions.gen_random_bytes' in pg_get_functiondef(p.oid)) > 0
                      then 'qualified' else 'UNQUALIFIED' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'next_contract_number')
  union all
  select 4, 'security mode unchanged (not SECURITY DEFINER)', 'false',
         (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'next_contract_number')
  union all
  select 5, 'owner unchanged', 'postgres',
         (select p.proowner::regrole::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'next_contract_number')
  union all
  select 6, 'generator works under bare public search_path', 'LND-OK',
         (select case when public.next_contract_number() ~ '^LND-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'
                      then 'LND-OK' else 'BAD' end
            from (select set_config('search_path', 'public', true)) _)
  union all
  select 7, 'environment marker intact', 'staging',
         (select env from public.environment_marker limit 1)
)
select item, expected, actual,
       case when expected = actual then 'OK' else 'FAIL' end as ok
from checks order by ord;
