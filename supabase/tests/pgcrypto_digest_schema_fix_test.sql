\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;
create or replace function traises(d text, sql text, code text) returns void language plpgsql as $$
begin execute sql; raise exception 'FAIL % expected %', d, code;
exception when others then if SQLSTATE=code then raise warning 'PASS % (%)', d, code; else raise exception 'FAIL % got % (%)', d, SQLSTATE, SQLERRM; end if; end $$;

-- 1. PG hash == known Web-Crypto/Edge SHA-256 hex (lowercase) for 'hello'
select teq('1 PG SHA-256 hex == Web Crypto (hello)',
  encode(extensions.digest(convert_to('hello','UTF8'),'sha256'),'hex'),
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

-- 1b. token_hash format preserved: digest(text) == digest(convert_to(text,UTF8)) for ASCII
select teq('1b ASCII token hash unchanged vs old digest(text)',
  encode(extensions.digest(convert_to('base64url-Tok_en-123','UTF8'),'sha256'),'hex'),
  encode(extensions.digest('base64url-Tok_en-123','sha256'),'hex'));

-- 2 + 3. Fresh receipt: found by status RPC AND claimed by the signup trigger.
--        (Edge inserts token_hash = same SHA-256 hex of the raw receipt.)
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size)
  values (encode(extensions.digest(convert_to('rcpt-A','UTF8'),'sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',2048);
select teq('2 status RPC finds fresh receipt (no 42883)', public.check_upload_receipt_status('rcpt-A'), 'valid');
select teq('2b valid RPC finds fresh receipt', public.check_upload_receipt_valid('rcpt-A')::text, 'true');

insert into auth.users (id, email, raw_user_meta_data) values ('66666666-0000-0000-0000-000000000001','m@e.sa',
  jsonb_build_object('account_type','merchant','full_name','R','merchant_application', jsonb_build_object(
    'company_name','Co','unified_number','7001234567','authorized_name','R','authorized_national_id','1122334455',
    'contact_mobile','512345678','categories','["dress"]'::jsonb,
    'branches', jsonb_build_array(jsonb_build_object('name','B','city','riyadh','address','A','map_url','https://maps.app.goo.gl/x')),
    'doc_receipt','rcpt-A')));
select teq('3 signup trigger CLAIMED the receipt (no 42883)',
  (select status from public.merchant_upload_tickets where token_hash=encode(extensions.digest(convert_to('rcpt-A','UTF8'),'sha256'),'hex')), 'claimed');
select teq('3b application created', (select count(*)::text from public.merchant_applications where applicant_user_id='66666666-0000-0000-0000-000000000001'), '1');

-- 4. Invalid receipt rejected by both RPC and trigger.
select teq('4 unknown receipt → missing', public.check_upload_receipt_status('does-not-exist'), 'missing');
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(extensions.digest(convert_to('rcpt-exp','UTF8'),'sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10, now()-interval '1 min');
select traises('4b trigger rejects expired receipt',
  $$insert into auth.users (id, email, raw_user_meta_data) values ('66666666-0000-0000-0000-000000000002','m2@e.sa',
    jsonb_build_object('account_type','merchant','full_name','R','merchant_application', jsonb_build_object(
      'company_name','Co','unified_number','7009998887','authorized_name','R','authorized_national_id','1122334455',
      'contact_mobile','512345678','categories','["dress"]'::jsonb,
      'branches', jsonb_build_array(jsonb_build_object('name','B','city','riyadh','address','A','map_url','https://maps.app.goo.gl/x')),
      'doc_receipt','rcpt-exp')))$$, 'P0120');

-- 5. No unqualified digest remains in the three functions' source.
select teq('5 no unqualified digest( in signup trigger',
  (select (position('extensions.digest' in prosrc) > 0 and position(' digest(' in prosrc) = 0)::text
     from pg_proc where proname='handle_new_auth_user'), 'true');
select teq('5b receipt-status uses extensions.digest',
  (select (position('extensions.digest' in prosrc) > 0)::text from pg_proc where proname='check_upload_receipt_status'), 'true');
select teq('5c receipt-valid uses extensions.digest',
  (select (position('extensions.digest' in prosrc) > 0)::text from pg_proc where proname='check_upload_receipt_valid'), 'true');

select '===== DIGEST SCHEMA-FIX TESTS PASSED =====' as r;
