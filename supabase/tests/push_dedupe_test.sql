-- Tests for 20260502125800_push_dedupe_and_claiming.sql
-- Run with psql AS A SUPERUSER/service context against a database with
-- ALL migrations applied (never production). Style matches the other
-- supabase/tests files.
\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

begin;
select set_config('request.jwt.claims', '', true);

-- Seed: two users + a fake damage case (FKs/user-triggers bypassed for
-- the scaffold only — every assertion below runs with triggers live).
insert into auth.users (id, email) values
  ('99999999-0000-0000-0000-0000000000c1','pushcust@e.sa'),
  ('99999999-0000-0000-0000-0000000000c2','pushmerch@e.sa')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role, mobile) values
  ('99999999-0000-0000-0000-0000000000c1','Push Customer','pushcust@e.sa','customer','509990001')
  on conflict (id) do nothing;
insert into public.profiles (id, full_name, email, role) values
  ('99999999-0000-0000-0000-0000000000c2','Push Merchant','pushmerch@e.sa','merchant')
  on conflict (id) do nothing;
set session_replication_role = replica;
insert into public.damage_cases
  (id, case_number, contract_id, customer_user_id, merchant_id, severity, description)
values ('99999999-0000-0000-0000-0000000000d1','PUSHTEST-1',
        gen_random_uuid(),'99999999-0000-0000-0000-0000000000c1',
        gen_random_uuid(),'partial','push dedupe scaffold')
  on conflict (id) do nothing;
set session_replication_role = origin;

-- =====================================================================
-- A. Notification layer — one row per logical event
-- =====================================================================

-- 1. A notification insert creates EXACTLY one push job (trigger).
insert into public.notifications (user_id, type, case_id)
values ('99999999-0000-0000-0000-0000000000c1','dispute_claim_submitted',
        '99999999-0000-0000-0000-0000000000d1')
on conflict do nothing;
select id as n1 from public.notifications
 where user_id='99999999-0000-0000-0000-0000000000c1'
   and type='dispute_claim_submitted' \gset
select teq('1 one push job per notification',
  (select count(*)::text from push_jobs where notification_id = :'n1'), '1');

-- 2. Strictly-once dispute types: a duplicate insert is absorbed.
insert into public.notifications (user_id, type, case_id)
values ('99999999-0000-0000-0000-0000000000c1','dispute_claim_submitted',
        '99999999-0000-0000-0000-0000000000d1')
on conflict do nothing;
select teq('2 once-index dedupes (user,type,case)',
  (select count(*)::text from notifications
    where user_id='99999999-0000-0000-0000-0000000000c1'
      and type='dispute_claim_submitted'
      and case_id='99999999-0000-0000-0000-0000000000d1'), '1');

-- 3. Proposal types: once per (user,type,case,proposal_id); a second
--    proposal id legitimately notifies again.
insert into public.notifications (user_id, type, case_id, metadata)
values ('99999999-0000-0000-0000-0000000000c1','dispute_proposal_received',
        '99999999-0000-0000-0000-0000000000d1','{"proposal_id":"p-1","round":1}')
on conflict do nothing;
insert into public.notifications (user_id, type, case_id, metadata)
values ('99999999-0000-0000-0000-0000000000c1','dispute_proposal_received',
        '99999999-0000-0000-0000-0000000000d1','{"proposal_id":"p-1","round":1}')
on conflict do nothing;
insert into public.notifications (user_id, type, case_id, metadata)
values ('99999999-0000-0000-0000-0000000000c1','dispute_proposal_received',
        '99999999-0000-0000-0000-0000000000d1','{"proposal_id":"p-2","round":2}')
on conflict do nothing;
select teq('3a same proposal absorbed, new round kept',
  (select count(*)::text from notifications
    where type='dispute_proposal_received'
      and user_id='99999999-0000-0000-0000-0000000000c1'), '2');
select traises('3b direct duplicate raises unique_violation',
  $q$insert into public.notifications (user_id, type, case_id, metadata)
     values ('99999999-0000-0000-0000-0000000000c1','dispute_proposal_received',
             '99999999-0000-0000-0000-0000000000d1','{"proposal_id":"p-2"}')$q$, '23505');

-- 4. renter_otp_ready jobs carry the code-free nudge copy.
insert into public.notifications (user_id, type)
values ('99999999-0000-0000-0000-0000000000c1','renter_otp_ready');
select teq('4 otp nudge title+body+route',
  (select (title = 'رمز تحقق جديد' and body like 'وصلك رمز تحقق%' and route='/home')::text
     from push_jobs pj join notifications n on n.id = pj.notification_id
    where n.type='renter_otp_ready'
      and n.user_id='99999999-0000-0000-0000-0000000000c1'
    limit 1), 'true');

-- =====================================================================
-- B. Claiming — concurrent runs cannot double-send
-- =====================================================================

-- 5. Claim moves pending→processing (attempts consumed at claim) and a
--    second claim finds nothing.
select teq('5a claim returns all pending jobs',
  (select count(*)::text from public.claim_push_jobs(50)),
  (select count(*)::text from push_jobs));
select teq('5b claimed jobs are processing/attempts=1',
  (select (count(*) = 0)::text from push_jobs where status <> 'processing' or attempts <> 1 or claimed_at is null), 'true');
select teq('5c second claim gets zero jobs',
  (select count(*)::text from public.claim_push_jobs(50)), '0');

-- 6. Guarded finish: delivered → sent exactly once; a late duplicate
--    finish (or one against a sent job) writes nothing.
select id as j1 from push_jobs where notification_id = :'n1' \gset
select public.finish_push_job(:'j1', true, null);
select teq('6a delivered job is sent',
  (select (status='sent' and sent_at is not null and last_error is null)::text
     from push_jobs where id = :'j1'), 'true');
update push_jobs set sent_at = now() - interval '1 hour' where id = :'j1';
select public.finish_push_job(:'j1', false, 'late duplicate');
select teq('6b sent job can never regress or re-send',
  (select (status='sent' and last_error is null
           and sent_at < now() - interval '55 minutes')::text
     from push_jobs where id = :'j1'), 'true');

-- 7. Failed delivery → back to pending with the error; the 5th attempt
--    fails the job for good.
select id as j2 from push_jobs where status='processing' limit 1 \gset
select public.finish_push_job(:'j2', false, 'apns 503');
select teq('7a failed send returns to pending',
  (select (status='pending' and last_error='apns 503')::text from push_jobs where id = :'j2'), 'true');
update push_jobs set attempts = 5 where id = :'j2';
update push_jobs set status='processing', claimed_at=now() where id = :'j2';
select public.finish_push_job(:'j2', false, 'apns 503 again');
select teq('7b attempt cap fails the job',
  (select status from push_jobs where id = :'j2'), 'failed');

-- 8. Stale-processing requeue: a crashed run's job is reclaimable
--    after 10 minutes — and only then.
update push_jobs set status='processing', attempts=1, claimed_at = now() - interval '5 minutes'
 where id = :'j2';
select teq('8a fresh processing jobs are NOT requeued',
  (select count(*)::text from public.claim_push_jobs(50)), '0');
update push_jobs set claimed_at = now() - interval '11 minutes' where id = :'j2';
select teq('8b stale processing job is reclaimed once stale',
  (select count(*)::text from public.claim_push_jobs(50)), '1');
select teq('8c reclaim consumed another attempt',
  (select attempts::text from push_jobs where id = :'j2'), '2');

-- 9. Clients can never touch the outbox RPCs.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select traises('9a claim refused for clients',
  $q$select * from public.claim_push_jobs(1)$q$, '42501');
select traises('9b finish refused for clients',
  $q$select public.finish_push_job(gen_random_uuid(), true, null)$q$, '42501');
reset role;

-- =====================================================================
-- C. Device tokens — one active token per physical device
-- =====================================================================

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

-- 10. Re-registration with the SAME device id revokes the older token.
select public.register_push_token('devicetoken-aaaa-0001', 'ios', 'install-A');
select public.register_push_token('devicetoken-aaaa-0002', 'ios', 'install-A');
select teq('10a old same-device token revoked',
  (select (revoked_at is not null)::text from push_device_tokens where token='devicetoken-aaaa-0001'), 'true');
select teq('10b fresh token active',
  (select (revoked_at is null)::text from push_device_tokens where token='devicetoken-aaaa-0002'), 'true');

-- 11. A DIFFERENT device (and legacy NULL-device rows) stay active —
--     multi-device accounts keep one push per device.
select public.register_push_token('devicetoken-bbbb-0001', 'ios', 'install-B');
select public.register_push_token('devicetoken-cccc-0001', 'ios');  -- legacy caller, no device id
select teq('11 other-device + legacy tokens untouched',
  (select count(*)::text from push_device_tokens
    where user_id='99999999-0000-0000-0000-0000000000c1' and revoked_at is null), '3');

-- 12. Re-registering the SAME token stays a single row (unique token).
select public.register_push_token('devicetoken-bbbb-0001', 'ios', 'install-B');
select teq('12 token upsert never duplicates rows',
  (select count(*)::text from push_device_tokens where token='devicetoken-bbbb-0001'), '1');

reset role;
select set_config('request.jwt.claims', '', true);

rollback;
