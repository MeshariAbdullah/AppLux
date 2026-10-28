-- =====================================================================
-- ONE-SHOT SQL-Editor apply of migration 20260502130400 (lend-test ONLY)
-- =====================================================================
-- Copy-paste this WHOLE file into the lend-test SQL Editor and run it
-- once. It is the exact committed migration
-- supabase/migrations/20260502130400_api_role_table_grants.sql
-- (commit 96ec620) wrapped in:
--   * a fail-closed preflight (staging marker, 64 prior migrations
--     intact, 130400 not already applied) — any failure aborts the
--     transaction before a single GRANT runs;
--   * the CLI-compatible migration-history INSERT, in the SAME
--     transaction as the grants (applied-and-recorded is atomic);
--   * a read-only validation report of EFFECTIVE privileges (via
--     has_table_privilege / has_sequence_privilege /
--     has_function_privilege, not just the grant statements).
--
-- It GRANTS only the audited matrix (no GRANT ALL, no default-privilege
-- changes, no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN), REVOKES nothing,
-- and does not touch RLS policies or function EXECUTE ACLs. The
-- pre-existing platform-default TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
-- entries are intentionally left as-is and are surfaced as an
-- informational row in the validation output.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Preflight — abort (rolling back everything) unless this is the
-- bootstrapped staging database in the expected state.
-- ---------------------------------------------------------------------
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
   where version between '20260502120000' and '20260502130300';
  if v_hist <> 64 then
    raise exception
      'ABORT: expected 64 migration records (20260502120000..20260502130300), found %.', v_hist;
  end if;

  select count(*) into v_dup
    from supabase_migrations.schema_migrations
   where version = '20260502130400';
  if v_dup <> 0 then
    raise exception 'ABORT: migration 20260502130400 is already recorded as applied.';
  end if;

  raise notice 'Preflight OK: staging marker, 64 prior migrations intact, 130400 not yet applied.';
end $$;

-- ---------------------------------------------------------------------
-- Migration 20260502130400 — verbatim grants (commit 96ec620)
-- ---------------------------------------------------------------------

-- authenticated — SELECT (the signed-in app's direct reads)
grant select on public.contract_receipt_photos         to authenticated;
grant select on public.damage_cases                    to authenticated;
grant select on public.damage_evidence                 to authenticated;
grant select on public.dispute_events                  to authenticated;
grant select on public.dispute_proposal_responses      to authenticated;
grant select on public.dispute_settlement_proposals    to authenticated;
grant select on public.merchant_activities             to authenticated;
grant select on public.merchant_application_activities to authenticated;
grant select on public.merchant_application_branches   to authenticated;
grant select on public.merchant_applications           to authenticated;
grant select on public.merchant_branches               to authenticated;
grant select on public.merchant_documents              to authenticated;
grant select on public.merchants                       to authenticated;
grant select on public.notifications                   to authenticated;
grant select on public.profiles                        to authenticated;
grant select on public.promissory_notes                to authenticated;
grant select on public.push_device_tokens              to authenticated;
grant select on public.rental_contracts                to authenticated;
grant select on public.rental_eligibility              to authenticated;
grant select on public.rental_invoice_items            to authenticated;
grant select on public.rental_invoices                 to authenticated;

-- authenticated — INSERT (RLS WITH CHECK gates rows)
grant insert on public.damage_cases          to authenticated;
grant insert on public.damage_evidence       to authenticated;
grant insert on public.merchant_applications to authenticated;
grant insert on public.rental_eligibility    to authenticated;  -- upsert
grant insert on public.rental_invoice_items  to authenticated;
grant insert on public.rental_invoices       to authenticated;

-- authenticated — UPDATE (RLS + guard triggers gate rows/columns)
grant update on public.merchant_applications to authenticated;
grant update on public.notifications         to authenticated;
grant update on public.profiles              to authenticated;
grant update on public.rental_eligibility    to authenticated;  -- upsert

-- authenticated — sequence USAGE (non-SECURITY-DEFINER next_* RPCs)
grant usage on sequence public.case_number_seq     to authenticated;
grant usage on sequence public.contract_number_seq to authenticated;
grant usage on sequence public.invoice_number_seq  to authenticated;
grant usage on sequence public.note_number_seq     to authenticated;

-- service_role — exactly what the Edge Functions do via PostgREST
grant select, insert, update on public.merchant_upload_tickets to service_role;
grant select on public.profiles to service_role;

-- ---------------------------------------------------------------------
-- Record the migration (CLI-compatible; atomic with the grants above)
-- ---------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
values ('20260502130400', 'api_role_table_grants');

commit;

-- =====================================================================
-- Validation — read-only report of EFFECTIVE privileges. Every row's
-- `ok` must read OK (the PLATFORM-DEFAULT row is INFO: pre-existing,
-- deliberately unchanged).
-- =====================================================================
with t as (
  select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
checks(ord, item, expected, actual) as (
  select 1, 'anon: tables with ANY data verb', '0',
         (select count(*) from t where has_table_privilege('anon', oid, 'SELECT')
             or has_table_privilege('anon', oid, 'INSERT')
             or has_table_privilege('anon', oid, 'UPDATE')
             or has_table_privilege('anon', oid, 'DELETE'))::text
  union all
  select 2, 'authenticated: tables with SELECT', '21',
         (select count(*) from t where has_table_privilege('authenticated', oid, 'SELECT'))::text
  union all
  select 3, 'authenticated: tables with INSERT', '6',
         (select count(*) from t where has_table_privilege('authenticated', oid, 'INSERT'))::text
  union all
  select 4, 'authenticated: tables with UPDATE', '4',
         (select count(*) from t where has_table_privilege('authenticated', oid, 'UPDATE'))::text
  union all
  select 5, 'authenticated: tables with DELETE', '0',
         (select count(*) from t where has_table_privilege('authenticated', oid, 'DELETE'))::text
  union all
  select 6, 'service_role: data-verb tables (tickets S/I/U + profiles S, no DELETE)', 'merchant_upload_tickets=SIU,profiles=S',
         coalesce((select string_agg(relname || '=' ||
                  (case when has_table_privilege('service_role', oid, 'SELECT') then 'S' else '' end) ||
                  (case when has_table_privilege('service_role', oid, 'INSERT') then 'I' else '' end) ||
                  (case when has_table_privilege('service_role', oid, 'UPDATE') then 'U' else '' end) ||
                  (case when has_table_privilege('service_role', oid, 'DELETE') then 'D' else '' end),
                  ',' order by relname)
            from t where has_table_privilege('service_role', oid, 'SELECT')
                or has_table_privilege('service_role', oid, 'INSERT')
                or has_table_privilege('service_role', oid, 'UPDATE')
                or has_table_privilege('service_role', oid, 'DELETE')), 'NONE')
  union all
  select 7, 'environment_marker: data verbs for any API role', '0',
         (select count(*) from t where relname = 'environment_marker'
             and (has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'SELECT')
               or has_table_privilege('service_role', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT')
               or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('service_role', oid, 'INSERT')
               or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'UPDATE')
               or has_table_privilege('service_role', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE')
               or has_table_privilege('authenticated', oid, 'DELETE') or has_table_privilege('service_role', oid, 'DELETE')))::text
  union all
  select 8, 'authenticated: sequences with USAGE (4 numbering seqs, not merchant_app_seq)', '4',
         (select count(*) from pg_sequences s
           where s.schemaname = 'public'
             and has_sequence_privilege('authenticated', ('public.' || s.sequencename)::regclass, 'USAGE'))::text
  union all
  select 9, 'anon: sequences with USAGE', '0',
         (select count(*) from pg_sequences s
           where s.schemaname = 'public'
             and has_sequence_privilege('anon', ('public.' || s.sequencename)::regclass, 'USAGE'))::text
  union all
  select 10, 'sensitive RPC revokes intact (anon/auth cannot exec cleanup lister)', 'f,f',
         (select bool_or(has_function_privilege('anon', p.oid, 'execute'))::text || ',' ||
                 bool_or(has_function_privilege('authenticated', p.oid, 'execute'))::text
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'list_orphaned_upload_tickets')
  union all
  select 11, 'registration_otp_precheck still not anon/auth-executable', 'f,f',
         (select bool_or(has_function_privilege('anon', p.oid, 'execute'))::text || ',' ||
                 bool_or(has_function_privilege('authenticated', p.oid, 'execute'))::text
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'registration_otp_precheck')
  union all
  select 12, 'RLS still enabled on all public tables', '27',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity)::text
  union all
  select 13, 'migration history now (64 + this one)', '65',
         (select count(*) from supabase_migrations.schema_migrations)::text
  union all
  select 14, 'PLATFORM DEFAULT (INFO, unchanged): tables where anon holds TRUNCATE', 'non-zero; pre-existing',
         (select count(*) from t where has_table_privilege('anon', oid, 'TRUNCATE'))::text
)
select item, expected, actual,
       case
         when ord = 14 then 'INFO'
         when ord = 6  then case when actual = 'merchant_upload_tickets=SIU,profiles=S' then 'OK' else 'FAIL' end
         when ord in (10, 11) then case when actual = 'false,false' then 'OK' else 'FAIL' end
         when expected = actual then 'OK'
         else 'FAIL'
       end as ok
from checks
order by ord;
