-- =====================================================================
-- Lend — STAGING verification (READ-ONLY)
-- =====================================================================
-- Run in the lend-test SQL Editor after:
--   1. the migration chain (supabase db push), and
--   2. supabase/maintenance/staging_bootstrap.sql.
--
-- Also safe to run BEFORE the seeds (seed checks just show 0/absent)
-- and on any database at all — it changes nothing, it only reports.
--
-- Read the `ok` column: every row should say OK. Any MISSING/LOW row
-- tells you exactly which setup step to revisit.
-- =====================================================================

with checks(ord, item, expected, actual) as (
  -- Environment identity -------------------------------------------------
  select 1, 'environment marker',
         'staging',
         coalesce((select env from public.environment_marker limit 1), 'ABSENT — run staging_bootstrap.sql')
  union all
  -- Schema surface (counts from the repo migration chain) ----------------
  select 2, 'public tables (26 + environment_marker = 27)',
         '>= 27',
         (select count(*)::text from pg_tables where schemaname = 'public')
  union all
  select 3, 'public functions (~83 from migrations)',
         '>= 80',
         (select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public')
  union all
  select 4, 'triggers on public tables',
         '>= 25',
         (select count(distinct tgname)::text from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and not t.tgisinternal)
  union all
  select 5, 'RLS policies (public + storage)',
         '>= 75',
         (select count(*)::text from pg_policies
          where schemaname in ('public', 'storage'))
  union all
  select 6, 'tables with RLS enabled',
         '>= 26',
         (select count(*)::text from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity)
  union all
  -- Newest-migration spot checks (chain actually reached 130300) ---------
  select 7, 'registration preflight (130300)',
         'present',
         case when to_regprocedure('public.registration_otp_precheck(text, text, text)') is not null
                or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = 'registration_otp_precheck')
              then 'present' else 'MISSING' end
  union all
  select 8, 'push claiming (125800)',
         'present',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = 'claim_push_jobs')
              then 'present' else 'MISSING' end
  union all
  -- Extensions ------------------------------------------------------------
  select 9, 'extensions pgcrypto + citext',
         '2',
         (select count(*)::text from pg_extension where extname in ('pgcrypto', 'citext'))
  union all
  -- Realtime --------------------------------------------------------------
  select 10, 'notifications in supabase_realtime publication',
         'present',
         case when exists (select 1 from pg_publication_tables
                           where pubname = 'supabase_realtime'
                             and schemaname = 'public' and tablename = 'notifications')
              then 'present' else 'MISSING (live notification badges will not update)' end
  union all
  -- Storage ---------------------------------------------------------------
  select 11, 'bucket merchant-documents (migration 124000)',
         'private',
         coalesce((select case when public then 'PUBLIC (wrong)' else 'private' end
                     from storage.buckets where id = 'merchant-documents'), 'MISSING')
  union all
  select 12, 'bucket damage-evidence (staging_bootstrap)',
         'private',
         coalesce((select case when public then 'PUBLIC (wrong)' else 'private' end
                     from storage.buckets where id = 'damage-evidence'), 'MISSING — run staging_bootstrap.sql')
  union all
  -- Seeds (informational until you run customer_scenarios.sql) -----------
  select 13, 'seeded test accounts (4 customers + 1 merchant owner)',
         '5 (0 before seeding)',
         (select count(*)::text from auth.users where email like '%@lend.test')
  union all
  select 14, 'seeded users can sign in (auth.identities rows)',
         'matches seeded accounts',
         (select count(*)::text from auth.identities i
           join auth.users u on u.id = i.user_id
          where u.email like '%@lend.test' and i.provider = 'email')
  union all
  -- The one check that must stay LOW: no real people in here --------------
  select 15, 'auth users OUTSIDE @lend.test (should be ~your own test logins only)',
         'small number you can personally account for',
         (select count(*)::text from auth.users
          where email is null or email not like '%@lend.test')
)
select
  item,
  expected,
  actual,
  case
    when ord = 1  then case when actual = 'staging' then 'OK' else 'FAIL' end
    when ord = 2  then case when actual::int >= 27 then 'OK' else 'LOW' end
    when ord = 3  then case when actual::int >= 80 then 'OK' else 'LOW' end
    when ord = 4  then case when actual::int >= 25 then 'OK' else 'LOW' end
    when ord = 5  then case when actual::int >= 75 then 'OK' else 'LOW' end
    when ord = 6  then case when actual::int >= 26 then 'OK' else 'LOW' end
    when ord = 9  then case when actual = '2' then 'OK' else 'FAIL' end
    when ord in (7, 8, 10) then case when actual = 'present' then 'OK' else 'FAIL' end
    when ord in (11, 12)   then case when actual = 'private' then 'OK' else 'FAIL' end
    when ord = 13 then case when actual in ('0', '5') then 'OK' else 'CHECK' end
    when ord = 14 then 'INFO'
    when ord = 15 then 'REVIEW BY HAND'
    else 'INFO'
  end as ok
from checks
order by ord;

-- ---------------------------------------------------------------------
-- Not checkable from SQL (verify in the Dashboard / CLI — the runbook
-- docs/staging-environment.md walks each one):
--   * Edge Functions deployed: otp-send, registration-otp-send,
--     registration-otp-verify, push-dispatch, merchant-doc-upload,
--     merchant-doc-cleanup — with config.toml's verify_jwt flags.
--   * Function secrets set (or deliberately unset on staging: MSEGAT_*).
--   * Auth → URL Configuration: staging Site URL + redirect URLs.
--   * Auth → SMTP (built-in mailer is acceptable for staging).
--   * pg_cron schedule for push-dispatch (optional on staging).
-- ---------------------------------------------------------------------
