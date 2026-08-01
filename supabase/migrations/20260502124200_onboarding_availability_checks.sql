-- =====================================================================
-- Onboarding early-validation endpoints — surface known conflicts in the
-- step where the field is entered, not at final submit.
--
-- Two neutral, server-authoritative checks (companions to
-- check_unified_number_available, 20260502124100):
--
--   1. check_email_available(text) — is the signup email free? The
--      wizard must NOT query auth.users from the browser; this
--      SECURITY DEFINER function does it safely and returns ONLY a
--      boolean. It blocks a CONFIRMED account only: an UNCONFIRMED
--      address is "available" so the user can continue and GoTrue
--      resends the OTP (matches the resume behavior). GoTrue's signup
--      remains the final authority.
--
--   2. check_upload_receipt_valid(text) — is the quarantined CR-document
--      receipt still usable (uploaded, unexpired, right type, not
--      deleted/claimed)? Lets Step 5 / pre-submit catch an expired
--      receipt before signup. Takes the OPAQUE receipt (no enumeration
--      risk); only its SHA-256 hash is compared.
--
-- Deliberately NOT added: representative National ID / mobile
-- uniqueness — there is NO such DB constraint for merchants (the
-- profiles_*_customer_unique indexes are scoped to role='customer'), so
-- an early "already used" block would be a client-only rule with no
-- backstop. Those fields keep format/required validation only.
--
-- Security: neutral boolean results, no names/emails/ids/statuses
-- returned. Fixed search_path. Enumeration risk for check_email_available
-- is the usual email-existence oracle (mitigate with rate-limiting at the
-- edge if needed); check_upload_receipt_valid has none (opaque token).
--
-- ROLLBACK: drop function public.check_email_available(text);
--           drop function public.check_upload_receipt_valid(text);
-- NOT auto-applied.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Signup email availability (blocks a CONFIRMED account only).
-- ---------------------------------------------------------------------
create or replace function public.check_email_available(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  -- Malformed → "not available" without any lookup (the client validates
  -- format first; this is only a safe guard).
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;
  if exists (
    select 1 from auth.users u
    where lower(u.email) = v_email
      and u.email_confirmed_at is not null
  ) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.check_email_available(text) from public;
grant execute on function public.check_email_available(text) to anon, authenticated;

comment on function public.check_email_available(text) is
  'Neutral signup-email availability. Returns false only when a CONFIRMED auth account already uses the email (unconfirmed = available, so OTP resend works), or when malformed. SECURITY DEFINER; returns no account detail. GoTrue signup remains authoritative.';

-- ---------------------------------------------------------------------
-- 2. Quarantined CR-document receipt validity.
-- ---------------------------------------------------------------------
create or replace function public.check_upload_receipt_valid(p_receipt text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if coalesce(trim(p_receipt), '') = '' then
    return false;
  end if;
  v_hash := encode(digest(p_receipt, 'sha256'), 'hex');
  return exists (
    select 1 from public.merchant_upload_tickets
    where token_hash = v_hash
      and status = 'uploaded'
      and expires_at > now()
      and doc_type = 'commercial_registration'
  );
end;
$$;

revoke all on function public.check_upload_receipt_valid(text) from public;
grant execute on function public.check_upload_receipt_valid(text) to anon, authenticated;

comment on function public.check_upload_receipt_valid(text) is
  'Neutral validity check for a quarantined CR-document receipt: true only when the ticket is still uploaded, unexpired, and the right type. Takes the opaque receipt (only its SHA-256 hash is used); no enumeration risk.';
