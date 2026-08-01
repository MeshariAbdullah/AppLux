\set ON_ERROR_STOP on
create or replace function teq(d text, got text, want text) returns void language plpgsql as $$
begin if got is not distinct from want then raise warning 'PASS % (=%)', d, got;
else raise exception 'FAIL % got=% want=%', d, got, want; end if; end $$;

-- fixtures: a confirmed user, an unconfirmed user
insert into auth.users (id, email, email_confirmed_at) values ('44444444-0000-0000-0000-000000000001','taken@e.sa', now());
insert into auth.users (id, email, email_confirmed_at) values ('44444444-0000-0000-0000-000000000002','pending@e.sa', null);

-- EMAIL availability
select teq('email: fresh available', public.check_email_available('new@e.sa')::text, 'true');
select teq('email: confirmed → not available', public.check_email_available('taken@e.sa')::text, 'false');
select teq('email: case-insensitive', public.check_email_available('TAKEN@E.SA')::text, 'false');
select teq('email: UNCONFIRMED → available (resume/OTP)', public.check_email_available('pending@e.sa')::text, 'true');
select teq('email: malformed → false', public.check_email_available('not-an-email')::text, 'false');
select teq('email: empty → false', public.check_email_available('')::text, 'false');
select teq('grant: anon may check email',
  has_function_privilege('anon','public.check_email_available(text)','execute')::text, 'true');

-- RECEIPT validity
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('good-r','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10, now()+interval '20 min');
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('expired-r','sha256'),'hex'),'commercial_registration','uploaded','q/cr.pdf','application/pdf',10, now()-interval '1 min');
insert into public.merchant_upload_tickets (token_hash, doc_type, status, storage_path, mime_type, file_size, expires_at)
  values (encode(digest('claimed-r','sha256'),'hex'),'commercial_registration','claimed','q/cr.pdf','application/pdf',10, now()+interval '20 min');

select teq('receipt: valid uploaded+unexpired → true', public.check_upload_receipt_valid('good-r')::text, 'true');
select teq('receipt: expired → false', public.check_upload_receipt_valid('expired-r')::text, 'false');
select teq('receipt: already claimed → false', public.check_upload_receipt_valid('claimed-r')::text, 'false');
select teq('receipt: unknown → false', public.check_upload_receipt_valid('nope')::text, 'false');
select teq('receipt: empty → false', public.check_upload_receipt_valid('')::text, 'false');
select teq('grant: anon may check receipt',
  has_function_privilege('anon','public.check_upload_receipt_valid(text)','execute')::text, 'true');

select '===== ONBOARDING AVAILABILITY TESTS PASSED =====' as r;
