-- =====================================================================
-- Registration preflight — duplicate email/mobile detection BEFORE the
-- signup OTP SMS is sent.
-- =====================================================================
-- Real-testing finding: registration texted the OTP first and only
-- discovered "email/mobile already registered" AFTER the user typed a
-- correct code (at auth.signUp — the GoTrue obfuscated duplicate
-- response for email, the profiles_mobile_customer_unique 23505 for
-- customer mobile). Every duplicate attempt therefore cost an SMS and
-- a wasted verification round.
--
-- This migration adds ONE service-role-only precheck RPC that the
-- registration-otp-send Edge Function calls BEFORE
-- registration_otp_start (and therefore before any MSEGAT call and
-- before any registration_otp_challenges row exists):
--
--   registration_otp_precheck(p_mobile, p_account_role, p_email)
--     → 'ok' | 'invalid_input' | 'invalid_mobile' | 'invalid_email'
--       | 'email_taken' | 'mobile_taken' | 'rate_limited'
--
-- Rules (exactly the ones the real signup enforces — this RPC is a
-- preview, the constraints below stay the final authority):
--   * email  — taken when a CONFIRMED auth.users row uses it (an
--     UNCONFIRMED address stays "available" so an interrupted signup
--     can resume with GoTrue re-sending its email code; same
--     semantics as check_email_available, 20260502124200). Applies to
--     customer AND merchant signups (one auth namespace).
--   * mobile — customer signups only: taken when a customer profile
--     already holds the number (profiles_mobile_customer_unique,
--     20260502121200, remains the race-safe backstop). Merchant
--     contact mobiles have deliberately NO uniqueness rule (decided
--     in 20260502124200 — no DB constraint exists, so a preflight
--     block would be an unbackstopped client-only rule) and always
--     pass.
--
-- The RPC RETURNS statuses instead of raising: a raise would roll
-- back the probe-throttle record below, letting duplicate lookups be
-- hammered for free. It never returns account details — only whether
-- registration can proceed, and it stores/logs no email.
--
-- Probe throttling: answering "taken/available" before any challenge
-- exists is an account-existence oracle, so probes get their own cap:
-- every precheck records a row in registration_precheck_attempts and
-- more than 10 per mobile per hour returns 'rate_limited'. The cap is
-- above the real send cap (5/hour, P0196 in registration_otp_start,
-- both still enforced there unchanged) so legitimate users never hit
-- it first. Rows hold the canonical mobile only (same datum the
-- challenges table already stores) and are pruned after 24h.
--
-- registration_otp_start / _check and the whole challenge lifecycle
-- are UNTOUCHED.
--
-- ROLLBACK:
--   drop function public.registration_otp_precheck(text, text, text);
--   drop table public.registration_precheck_attempts;
-- NOT auto-applied.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Probe-throttle ledger
-- ---------------------------------------------------------------------

create table if not exists public.registration_precheck_attempts (
  id         uuid primary key default gen_random_uuid(),
  mobile     text not null,
  created_at timestamptz not null default now()
);

create index if not exists registration_precheck_attempts_mobile_idx
  on public.registration_precheck_attempts (mobile, created_at desc);

alter table public.registration_precheck_attempts enable row level security;
revoke all on public.registration_precheck_attempts from anon, authenticated;

comment on table public.registration_precheck_attempts is
  'Per-mobile throttle ledger for registration_otp_precheck (the pre-SMS duplicate check). Canonical mobile + timestamp only — no email, no outcome. Pruned after 24 hours.';

-- ---------------------------------------------------------------------
-- (2) The precheck RPC (service-role only, via registration-otp-send)
-- ---------------------------------------------------------------------

create or replace function public.registration_otp_precheck(
  p_mobile       text,
  p_account_role text default 'customer',
  p_email        text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
  v_email     text;
  v_probes    int;
begin
  -- Service-role only (the Edge Function). PostgREST end-user JWTs
  -- run as anon/authenticated — refuse them outright.
  if current_user in ('anon', 'authenticated') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_account_role not in ('customer', 'merchant') then
    return 'invalid_input';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return 'invalid_mobile';
  end if;

  -- Probe throttle: record THIS attempt, then cap the hourly window.
  -- (Statuses are returned, not raised, so this insert commits.)
  delete from public.registration_precheck_attempts
   where created_at < now() - interval '24 hours';
  insert into public.registration_precheck_attempts (mobile)
  values (v_canonical);
  select count(*) into v_probes
    from public.registration_precheck_attempts a
   where a.mobile = v_canonical
     and a.created_at > now() - interval '1 hour';
  if v_probes > 10 then
    return 'rate_limited';
  end if;

  -- Email availability (both roles share the auth namespace). A
  -- CONFIRMED account blocks; an unconfirmed one stays available so
  -- the interrupted-signup resume path keeps working.
  if p_email is not null and trim(p_email) <> '' then
    v_email := lower(trim(p_email));
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      return 'invalid_email';
    end if;
    if exists (
      select 1 from auth.users u
      where lower(u.email) = v_email
        and u.email_confirmed_at is not null
    ) then
      return 'email_taken';
    end if;
  end if;

  -- Mobile availability — customer rule only (see header: merchant
  -- contact mobiles have no uniqueness rule by design).
  if p_account_role = 'customer' and exists (
    select 1 from public.profiles p
    where p.role = 'customer'
      and p.mobile = v_canonical
  ) then
    return 'mobile_taken';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.registration_otp_precheck(text, text, text)
  from public, anon, authenticated;
grant execute on function public.registration_otp_precheck(text, text, text)
  to service_role;

comment on function public.registration_otp_precheck(text, text, text) is
  'SERVICE-ROLE ONLY (registration-otp-send Edge Function): pre-SMS duplicate check for signup. Returns ok / invalid_input / invalid_mobile / invalid_email / email_taken (confirmed auth account) / mobile_taken (existing customer profile mobile; customer signups only) / rate_limited (>10 prechecks per mobile per hour). Returns statuses, never account details; the unique constraints and GoTrue remain the final authority at the actual signup.';
