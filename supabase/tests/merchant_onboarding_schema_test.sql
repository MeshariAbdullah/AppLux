-- Commit A DB tests — run inside the replayed `lend` DB.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function test_eq(d_desc text, got text, want text) returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS % (=%)', d_desc, coalesce(got,'NULL');
  else raise exception 'FAIL % : got=% want=%', d_desc, coalesce(got,'NULL'), coalesce(want,'NULL'); end if;
end $$;

create or replace function test_raises(d_desc text, sql text, want_code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL % : expected error % but none raised', d_desc, want_code;
exception when others then
  if SQLSTATE = want_code then raise notice 'PASS % (raised %)', d_desc, want_code;
  else raise exception 'FAIL % : got % (%) want %', d_desc, SQLSTATE, SQLERRM, want_code; end if;
end $$;

-- ---------- fixtures ----------
insert into auth.users (id, email) values ('11111111-2222-3333-4444-555555550001', 'rep@est.sa');

-- ============================================================
-- 1. unified_number format constraint
-- ============================================================
select test_raises('1a reject non-700 unified',
  $$insert into public.merchant_applications (applicant_user_id, company_name, unified_number, authorized_name, authorized_national_id, city, primary_category)
    values ('11111111-2222-3333-4444-555555550001','Est','1234567890','Rep','1122334455','riyadh','dress')$$,
  '23514'); -- check_violation

select test_raises('1b reject 9-digit unified',
  $$insert into public.merchant_applications (applicant_user_id, company_name, unified_number, authorized_name, authorized_national_id, city, primary_category)
    values ('11111111-2222-3333-4444-555555550001','Est','700123456','Rep','1122334455','riyadh','dress')$$,
  '23514');

insert into public.merchant_applications (id, applicant_user_id, company_name, unified_number, authorized_name, authorized_national_id, city, primary_category, status)
  values ('11111111-2222-3333-4444-5555555500b1','11111111-2222-3333-4444-555555550001','Est','7001234567','Rep','1122334455','riyadh','dress','pending');
select test_eq('1c accept valid 700 unified',
  (select unified_number from public.merchant_applications where id='11111111-2222-3333-4444-5555555500b1'),
  '7001234567');

-- ============================================================
-- 2. unified_number uniqueness (pending)
-- ============================================================
insert into auth.users (id, email) values ('11111111-2222-3333-4444-555555550002','rep2@est.sa');
select test_raises('2 duplicate pending unified rejected',
  $$insert into public.merchant_applications (applicant_user_id, company_name, unified_number, authorized_name, authorized_national_id, city, primary_category, status)
    values ('11111111-2222-3333-4444-555555550002','Est2','7001234567','Rep2','2233445566','riyadh','bag','pending')$$,
  '23505');

-- ============================================================
-- 3. commercial_reg_number now nullable (application + merchant)
-- ============================================================
select test_eq('3 commercial_reg_number nullable on merchant_applications',
  (select is_nullable from information_schema.columns where table_name='merchant_applications' and column_name='commercial_reg_number'),
  'YES');

-- ============================================================
-- 4. multi-activity: multiple activities per application
-- ============================================================
insert into public.merchant_application_activities (application_id, category, position) values
  ('11111111-2222-3333-4444-5555555500b1','dress',0),
  ('11111111-2222-3333-4444-5555555500b1','bag',1),
  ('11111111-2222-3333-4444-5555555500b1','watch',2);
select test_eq('4 three activities stored',
  (select count(*)::text from public.merchant_application_activities where application_id='11111111-2222-3333-4444-5555555500b1'),
  '3');
select test_raises('4b duplicate activity rejected',
  $$insert into public.merchant_application_activities (application_id, category, position) values ('11111111-2222-3333-4444-5555555500b1','dress',9)$$,
  '23505');

-- ============================================================
-- 5. branch map_url https/google constraint
-- ============================================================
insert into public.merchant_application_branches (application_id, name, city, address, map_url, position)
  values ('11111111-2222-3333-4444-5555555500b1','Main','riyadh','King Rd','https://maps.app.goo.gl/abc123',0);
select test_eq('5 valid goo.gl map url accepted',
  (select map_url from public.merchant_application_branches where application_id='11111111-2222-3333-4444-5555555500b1'),
  'https://maps.app.goo.gl/abc123');
select test_raises('5b http (non-https) map url rejected',
  $$insert into public.merchant_application_branches (application_id, name, city, address, map_url, position)
    values ('11111111-2222-3333-4444-5555555500b1','B2','riyadh','x','http://maps.google.com/x',1)$$, '23514');
select test_raises('5c non-google map url rejected',
  $$insert into public.merchant_application_branches (application_id, name, city, address, map_url, position)
    values ('11111111-2222-3333-4444-5555555500b1','B3','riyadh','x','https://evil.example.com/maps',2)$$, '23514');
select test_raises('5d javascript url rejected',
  $$insert into public.merchant_application_branches (application_id, name, city, address, map_url, position)
    values ('11111111-2222-3333-4444-5555555500b1','B4','riyadh','x','javascript:alert(1)',3)$$, '23514');

-- ============================================================
-- 6. merchant_documents scope + review status constraints
-- ============================================================
select test_raises('6 doc with neither app nor merchant rejected',
  $$insert into public.merchant_documents (doc_type, storage_path, original_name, mime_type, file_size)
    values ('commercial_registration','q/x.pdf','x.pdf','application/pdf',100)$$, '23514');
insert into public.merchant_documents (application_id, doc_type, storage_path, original_name, mime_type, file_size)
  values ('11111111-2222-3333-4444-5555555500b1','commercial_registration','quarantine/t1/cr.pdf','cr.pdf','application/pdf',2048);
select test_eq('6b doc stored', (select review_status from public.merchant_documents where application_id='11111111-2222-3333-4444-5555555500b1'), 'pending');
select test_raises('6c duplicate doc type per app rejected',
  $$insert into public.merchant_documents (application_id, doc_type, storage_path, original_name, mime_type, file_size)
    values ('11111111-2222-3333-4444-5555555500b1','commercial_registration','quarantine/t2/cr.pdf','cr.pdf','application/pdf',10)$$, '23505');

-- ============================================================
-- 7. storage bucket private + limits
-- ============================================================
select test_eq('7 bucket private', (select public::text from storage.buckets where id='merchant-documents'), 'false');
select test_eq('7b bucket 5MB limit', (select file_size_limit::text from storage.buckets where id='merchant-documents'), '5242880');

-- ============================================================
-- 8. upload ticket claim happy-path (simulate the trigger's claim)
-- ============================================================
-- issue a ticket as the edge function would
insert into public.merchant_upload_tickets (id, token_hash, doc_type, status, storage_path, original_name, mime_type, file_size, expires_at)
  values ('11111111-2222-3333-4444-5555555500c1', encode(digest('rawtoken-1','sha256'),'hex'),'commercial_registration','uploaded','quarantine/c1/cr.pdf','cr.pdf','application/pdf',3000, now()+interval '20 min');
select test_eq('8 ticket issued uploaded',
  (select status from public.merchant_upload_tickets where id='11111111-2222-3333-4444-5555555500c1'),'uploaded');

-- ============================================================
-- 9. orphan listing (24h) — fresh ticket NOT listed
-- ============================================================
select test_eq('9 fresh ticket not orphaned',
  (select count(*)::text from public.list_orphaned_upload_tickets() where id='11111111-2222-3333-4444-5555555500c1'),'0');
update public.merchant_upload_tickets set created_at = now() - interval '25 hours' where id='11111111-2222-3333-4444-5555555500c1';
select test_eq('9b aged unclaimed ticket orphaned',
  (select count(*)::text from public.list_orphaned_upload_tickets() where id='11111111-2222-3333-4444-5555555500c1'),'1');
select public.finalize_orphaned_upload_ticket('11111111-2222-3333-4444-5555555500c1');
select test_eq('9c finalized ticket expired + path cleared',
  (select status||'/'||coalesce(storage_path,'NULL') from public.merchant_upload_tickets where id='11111111-2222-3333-4444-5555555500c1'),'expired/NULL');

-- ============================================================
-- 10. claimed ticket is NOT orphaned (never purged)
-- ============================================================
insert into public.merchant_upload_tickets (id, token_hash, status, storage_path, created_at, claimed_at, claimed_application_id)
  values ('11111111-2222-3333-4444-5555555500c2', encode(digest('rawtoken-2','sha256'),'hex'),'claimed','quarantine/c2/cr.pdf', now()-interval '48 hours', now(), '11111111-2222-3333-4444-5555555500b1');
select test_eq('10 claimed ticket never orphaned',
  (select count(*)::text from public.list_orphaned_upload_tickets() where id='11111111-2222-3333-4444-5555555500c2'),'0');

select '===== ALL COMMIT-A DB TESTS PASSED =====' as result;
