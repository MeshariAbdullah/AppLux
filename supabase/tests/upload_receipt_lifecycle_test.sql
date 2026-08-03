\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

-- 1. column is NOT NULL with a future default
select teq('1 expires_at NOT NULL',
  (select is_nullable from information_schema.columns where table_name='merchant_upload_tickets' and column_name='expires_at'), 'NO');

-- 7. null expiry cannot be inserted
select traises('7 null expiry insert rejected',
  $$insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
    values (encode(digest('x','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10,null)$$, '23502');

-- 1b. fresh ticket via DEFAULT (edge omits expires_at) → future, non-null
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size)
  values (encode(digest('fresh','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',2048);
select teq('1c default gives future expiry',
  (select (expires_at > now())::text from public.merchant_upload_tickets where token_hash=encode(digest('fresh','sha256'),'hex')), 'true');

-- 2. fresh passes boolean RPC ; status = valid
select teq('2 fresh valid (bool)', public.check_upload_receipt_valid('fresh')::text, 'true');
select teq('2b fresh status', public.check_upload_receipt_status('fresh'), 'valid');

-- 3 + consistency: the SAME fresh receipt is accepted by the claim trigger
insert into auth.users (id, email, raw_user_meta_data) values ('55555555-0000-0000-0000-000000000001','m@e.sa',
  jsonb_build_object('account_type','merchant','full_name','R','merchant_application', jsonb_build_object(
    'company_name','Co','unified_number','7001234567','authorized_name','R','authorized_national_id','1122334455',
    'contact_mobile','512345678','categories','["dress"]'::jsonb,
    'branches', jsonb_build_array(jsonb_build_object('name','B','city','riyadh','address','A','map_url','https://maps.app.goo.gl/x')),
    'doc_receipt','fresh')));
select teq('3 trigger claimed the SAME fresh receipt',
  (select status from public.merchant_upload_tickets where token_hash=encode(digest('fresh','sha256'),'hex')), 'claimed');
select teq('3b claimed receipt status = claimed', public.check_upload_receipt_status('fresh'), 'claimed');
select teq('3c claimed receipt bool = false', public.check_upload_receipt_valid('fresh')::text, 'false');

-- 5/6. one-minute-after still valid ; exact boundary expired
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('min','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10, now()+interval '1 minute');
select teq('5 one-minute-after valid', public.check_upload_receipt_status('min'), 'valid');
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('boundary','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10, now()-interval '1 second');
select teq('6 just-past boundary expired', public.check_upload_receipt_status('boundary'), 'expired');
select teq('6b expired bool = false', public.check_upload_receipt_valid('boundary')::text, 'false');

-- 8/9/10/11 distinct statuses
select teq('11 unknown receipt → missing', public.check_upload_receipt_status('nope'), 'missing');
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('del','sha256'),'hex'),'commercial_registration','deleted',null,'application/pdf',10, now()+interval '20 min');
select teq('10 deleted → deleted', public.check_upload_receipt_status('del'), 'deleted');

-- trigger rejects an expired receipt (P0120)
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('exp','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10, now()-interval '1 min');
select traises('trigger rejects expired receipt',
  $$insert into auth.users (id, email, raw_user_meta_data) values ('55555555-0000-0000-0000-000000000002','m2@e.sa',
    jsonb_build_object('account_type','merchant','full_name','R','merchant_application', jsonb_build_object(
      'company_name','Co','unified_number','7009998887','authorized_name','R','authorized_national_id','1122334455',
      'contact_mobile','512345678','categories','["dress"]'::jsonb,
      'branches', jsonb_build_array(jsonb_build_object('name','B','city','riyadh','address','A','map_url','https://maps.app.goo.gl/x')),
      'doc_receipt','exp')))$$, 'P0120');

select teq('grant: anon may call status',
  has_function_privilege('anon','public.check_upload_receipt_status(text)','execute')::text, 'true');

select '===== RECEIPT LIFECYCLE TESTS PASSED =====' as r;
