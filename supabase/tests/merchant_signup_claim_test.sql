-- Commit A — end-to-end signup trigger claim tests.
\set ON_ERROR_STOP on

create or replace function teq(d_desc text, got text, want text) returns void language plpgsql as $$
begin
  if got is not distinct from want then raise warning 'PASS % (=%)', d_desc, coalesce(got,'NULL');
  else raise exception 'FAIL % : got=% want=%', d_desc, coalesce(got,'NULL'), coalesce(want,'NULL'); end if;
end $$;
create or replace function traises(d_desc text, sql text, want_code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % : expected %', d_desc, want_code;
exception when others then
  if SQLSTATE = want_code then raise warning 'PASS % (%)', d_desc, want_code;
  else raise exception 'FAIL % : got % (%)', d_desc, SQLSTATE, SQLERRM; end if;
end $$;

-- Helper: build merchant signup metadata with a given receipt + fields.
create or replace function mk_meta(receipt text, unified text, cats jsonb, map text) returns jsonb language sql as $$
  select jsonb_build_object(
    'account_type','merchant',
    'full_name','Owner Rep',
    'merchant_application', jsonb_build_object(
      'company_name','Maison Co',
      'unified_number', unified,
      'authorized_name','Owner Rep',
      'authorized_national_id','1122334455',
      'contact_mobile','512345678',
      'categories', cats,
      'branches', jsonb_build_array(jsonb_build_object('name','Main','city','riyadh','address','King Rd','phone','512345678','map_url', map)),
      'doc_receipt', receipt
    )
  );
$$;

-- ===== HAPPY PATH: valid receipt claimed atomically =====
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, original_name, mime_type, file_size, expires_at)
  values (encode(digest('good-receipt','sha256'),'hex'),'commercial_registration','uploaded','quarantine/g1/cr.pdf','cr.pdf','application/pdf',4096, now()+interval '20 min');

insert into auth.users (id, email, raw_user_meta_data)
  values ('22222222-0000-0000-0000-000000000001','m1@est.sa', mk_meta('good-receipt','7009998887', '["dress","bag"]'::jsonb, 'https://maps.app.goo.gl/xyz'));

select teq('T1 application created',
  (select unified_number from public.merchant_applications where applicant_user_id='22222222-0000-0000-0000-000000000001'),'7009998887');
select teq('T1b commercial_reg_number null (CR copy uploaded instead)',
  (select commercial_reg_number from public.merchant_applications where applicant_user_id='22222222-0000-0000-0000-000000000001'), NULL);
select teq('T1c primary_category = first activity',
  (select primary_category::text from public.merchant_applications where applicant_user_id='22222222-0000-0000-0000-000000000001'),'dress');
select teq('T2 both activities stored',
  (select count(*)::text from public.merchant_application_activities aa join public.merchant_applications a on a.id=aa.application_id where a.applicant_user_id='22222222-0000-0000-0000-000000000001'),'2');
select teq('T3 branch map_url stored',
  (select b.map_url from public.merchant_application_branches b join public.merchant_applications a on a.id=b.application_id where a.applicant_user_id='22222222-0000-0000-0000-000000000001'),'https://maps.app.goo.gl/xyz');
select teq('T4 document row claimed',
  (select upload_status||'/'||review_status from public.merchant_documents md join public.merchant_applications a on a.id=md.application_id where a.applicant_user_id='22222222-0000-0000-0000-000000000001'),'claimed/pending');
select teq('T4b document points at quarantine object',
  (select storage_path from public.merchant_documents md join public.merchant_applications a on a.id=md.application_id where a.applicant_user_id='22222222-0000-0000-0000-000000000001'),'quarantine/g1/cr.pdf');
select teq('T5 ticket marked claimed',
  (select status from public.merchant_upload_tickets where token_hash=encode(digest('good-receipt','sha256'),'hex')),'claimed');

-- ===== MISSING RECEIPT: signup aborts, no application =====
select traises('T6 missing receipt aborts signup',
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('22222222-0000-0000-0000-000000000002','m2@est.sa',
      jsonb_set(mk_meta('x','7001112223','["watch"]'::jsonb,'https://maps.app.goo.gl/a'),'{merchant_application,doc_receipt}','""'))$$,
  'P0120');
select teq('T6b no application for aborted signup',
  (select count(*)::text from public.merchant_applications where applicant_user_id='22222222-0000-0000-0000-000000000002'),'0');

-- ===== EXPIRED RECEIPT rejected =====
insert into public.merchant_upload_tickets (token_hash, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('expired-receipt','sha256'),'hex'),'uploaded','quarantine/e1/cr.pdf','application/pdf',10, now()-interval '1 min');
select traises('T7 expired receipt aborts signup',
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('22222222-0000-0000-0000-000000000003','m3@est.sa', mk_meta('expired-receipt','7002223334','["bag"]'::jsonb,'https://maps.app.goo.gl/b'))$$,
  'P0120');

-- ===== ALREADY-CLAIMED receipt cannot be reused =====
select traises('T8 reused (claimed) receipt aborts signup',
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('22222222-0000-0000-0000-000000000004','m4@est.sa', mk_meta('good-receipt','7003334445','["dress"]'::jsonb,'https://maps.app.goo.gl/c'))$$,
  'P0120');

-- ===== INVALID branch map url aborts =====
insert into public.merchant_upload_tickets (token_hash, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('good-receipt-2','sha256'),'hex'),'uploaded','quarantine/g2/cr.pdf','application/pdf',10, now()+interval '20 min');
select traises('T9 invalid branch map url aborts',
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('22222222-0000-0000-0000-000000000005','m5@est.sa', mk_meta('good-receipt-2','7004445556','["dress"]'::jsonb,'http://not-google.example/x'))$$,
  'P0120');
select teq('T9b receipt NOT consumed when signup aborts (still uploaded for retry)',
  (select status from public.merchant_upload_tickets where token_hash=encode(digest('good-receipt-2','sha256'),'hex')),'uploaded');

-- ===== non-700 unified aborts =====
insert into public.merchant_upload_tickets (token_hash, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('good-receipt-3','sha256'),'hex'),'uploaded','quarantine/g3/cr.pdf','application/pdf',10, now()+interval '20 min');
select traises('T10 non-700 unified aborts',
  $$insert into auth.users (id, email, raw_user_meta_data)
    values ('22222222-0000-0000-0000-000000000006','m6@est.sa', mk_meta('good-receipt-3','1234567890','["dress"]'::jsonb,'https://maps.app.goo.gl/d'))$$,
  'P0120');

select '===== ALL TRIGGER TESTS PASSED =====' as result;
