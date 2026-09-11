-- =====================================================================
-- Registration OTP — first-time signup mobile verification (send-only
-- SMS delivery via the SAME MSEGAT secrets as the renter-session OTP).
-- =====================================================================
-- SEPARATE from the renter/session OTP (renter_otp_challenges,
-- 20260502125100): different table, different RPCs, different Edge
-- Functions (registration-otp-send / registration-otp-verify), so the
-- two flows are enabled/disabled independently. NOTHING in the
-- existing rental flow is touched.
--
-- Model:
--   * The signup form (no session yet) asks registration-otp-send to
--     text a code to the mobile being registered. The DATABASE
--     generates the code; ONLY the sha256 hash is stored — the
--     plaintext goes straight from generation to the SMS provider in
--     the same service-role call and is never persisted (unlike the
--     renter flow's temporary in-app column, there is no in-app
--     delivery mode here to justify one).
--   * registration-otp-verify checks the code server-side
--     (hash compare, 5 attempts, 5-minute expiry, 60s resend
--     cooldown). MSEGAT hosted OTP verification is NOT used.
--   * When the account is then created, a BEFORE INSERT trigger on
--     profiles finds the verified challenge for that mobile, stamps
--     profiles.mobile_verified_at with the SERVER's verification
--     time, and consumes the challenge. The stamp therefore cannot
--     be forged from the client: it only ever comes from a code that
--     was actually verified through the RPCs. Signups without a
--     verified challenge still succeed (the requirement is enforced
--     by the flag-gated signup UI; the flag must be able to turn the
--     feature off without breaking signups) — they simply carry a
--     NULL mobile_verified_at.
--
-- Both RPCs are SERVICE-ROLE ONLY: the anonymous signup form can only
-- reach them through the Edge Functions, which own delivery and never
-- return the code.
--
-- Error codes (shared vocabulary with the renter flow where the
-- meaning is identical): P0190 invalid mobile; P0192 resend cooldown;
-- P0193 no active/expired challenge; P0194 attempt cap;
-- P0196 hourly send limit per mobile.
--
-- Idempotent. Additive only — no applied migration is modified.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) profiles.mobile_verified_at
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists mobile_verified_at timestamptz;

comment on column public.profiles.mobile_verified_at is
  'When the account mobile was confirmed by a registration OTP (server-verified challenge consumed at profile creation). NULL for accounts created before the feature or while it is disabled. Confirms control of the mobile at signup ONLY — not a National ID / government identity verification.';

-- ---------------------------------------------------------------------
-- (2) Challenge table — hash only, no plaintext column
-- ---------------------------------------------------------------------

create table if not exists public.registration_otp_challenges (
  id            uuid primary key default gen_random_uuid(),
  mobile        text not null,
  code_hash     text not null,
  attempts      int  not null default 0,
  expires_at    timestamptz not null,
  verified_at   timestamptz,
  -- Stamped when a newer challenge replaces this (unverified) one.
  superseded_at timestamptz,
  -- Stamped by the profiles trigger when the verification is spent on
  -- an account creation (single use).
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists registration_otp_challenges_mobile_idx
  on public.registration_otp_challenges (mobile, created_at desc);

alter table public.registration_otp_challenges enable row level security;
revoke all on public.registration_otp_challenges from anon, authenticated;

-- ---------------------------------------------------------------------
-- (3) Start: generate + return the code to the SERVICE CALLER only
-- ---------------------------------------------------------------------

create or replace function public.registration_otp_start(p_mobile text)
returns table (challenge_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
  v_code      text;
begin
  -- Service-role only (the Edge Function). PostgREST end-user JWTs
  -- run as anon/authenticated — refuse them outright.
  if current_user in ('anon', 'authenticated') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    raise exception 'Invalid mobile format' using errcode = 'P0190';
  end if;

  -- Resend cooldown: one challenge per mobile per 60 seconds.
  if exists (
    select 1 from public.registration_otp_challenges c
     where c.mobile = v_canonical
       and c.created_at > now() - interval '60 seconds'
  ) then
    raise exception 'A code was just sent — wait before resending'
      using errcode = 'P0192';
  end if;

  -- Abuse cap: at most 5 sends per mobile per hour.
  if (
    select count(*) from public.registration_otp_challenges c
     where c.mobile = v_canonical
       and c.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too many codes requested for this number — try later'
      using errcode = 'P0196';
  end if;

  -- Opportunistic hygiene: drop stale rows (nothing references them).
  delete from public.registration_otp_challenges
   where created_at < now() - interval '24 hours';

  -- Exactly one live code per mobile.
  update public.registration_otp_challenges
     set superseded_at = now()
   where mobile = v_canonical
     and verified_at is null
     and superseded_at is null;

  -- Cryptographically random 6-digit code (same construction as the
  -- renter flow; residual modulo bias is negligible at 5 attempts).
  v_code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(3), 'hex'))::bit(24)::int) % 1000000)::text,
    6, '0');

  return query
  insert into public.registration_otp_challenges (mobile, code_hash, expires_at)
  values (
    v_canonical,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    now() + interval '5 minutes'
  )
  returning registration_otp_challenges.id, v_code;
end;
$$;

revoke all on function public.registration_otp_start(text)
  from public, anon, authenticated;
grant execute on function public.registration_otp_start(text) to service_role;

comment on function public.registration_otp_start(text) is
  'SERVICE-ROLE ONLY (registration-otp-send Edge Function): creates a signup mobile-verification challenge and returns the plaintext code to the service caller for SMS dispatch. Hash-only storage; 5-minute expiry; 60s resend cooldown (P0192); 5 sends/hour per mobile (P0196); P0190 invalid mobile.';

-- ---------------------------------------------------------------------
-- (4) Check: hash compare, attempts, expiry
-- ---------------------------------------------------------------------

create or replace function public.registration_otp_check(
  p_mobile text,
  p_code   text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
  v_challenge public.registration_otp_challenges%rowtype;
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    raise exception 'Invalid mobile format' using errcode = 'P0190';
  end if;

  select * into v_challenge
    from public.registration_otp_challenges c
   where c.mobile = v_canonical
     and c.verified_at is null
     and c.superseded_at is null
     and c.consumed_at is null
   order by c.created_at desc
   limit 1
   for update;

  if not found or v_challenge.expires_at <= now() then
    raise exception 'No active code for this number — request a new one'
      using errcode = 'P0193';
  end if;

  if v_challenge.attempts >= 5 then
    raise exception 'Too many attempts — request a new code'
      using errcode = 'P0194';
  end if;

  update public.registration_otp_challenges
     set attempts = attempts + 1
   where id = v_challenge.id;

  if encode(extensions.digest(convert_to(p_code, 'UTF8'), 'sha256'), 'hex')
     is distinct from v_challenge.code_hash then
    -- Wrong code: the attempt was already counted above.
    return false;
  end if;

  update public.registration_otp_challenges
     set verified_at = now()
   where id = v_challenge.id;
  return true;
end;
$$;

revoke all on function public.registration_otp_check(text, text)
  from public, anon, authenticated;
grant execute on function public.registration_otp_check(text, text) to service_role;

comment on function public.registration_otp_check(text, text) is
  'SERVICE-ROLE ONLY (registration-otp-verify Edge Function): verifies a signup mobile code by hash. False on a wrong code (attempt counted); P0193 no active/expired challenge; P0194 after 5 attempts; P0190 invalid mobile.';

-- ---------------------------------------------------------------------
-- (5) Stamp mobile_verified_at at profile creation (server truth)
-- ---------------------------------------------------------------------
-- BEFORE INSERT on profiles: whoever creates the row (the
-- handle_new_auth_user trigger today, or any future path), a customer
-- profile whose mobile has a fresh verified challenge gets the
-- verification stamp and the challenge is consumed. Purely additive —
-- profiles without a challenge insert exactly as before.

create or replace function public.registration_stamp_mobile_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_verified_at  timestamptz;
begin
  if new.mobile is null or coalesce(new.role::text, 'customer') <> 'customer' then
    return new;
  end if;

  select c.id, c.verified_at into v_challenge_id, v_verified_at
    from public.registration_otp_challenges c
   where c.mobile = new.mobile
     and c.verified_at is not null
     and c.consumed_at is null
     and c.verified_at > now() - interval '1 hour'
   order by c.verified_at desc
   limit 1
   for update;

  if v_challenge_id is not null then
    update public.registration_otp_challenges
       set consumed_at = now()
     where id = v_challenge_id;
    new.mobile_verified_at := v_verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_insert_stamp_mobile_verified on public.profiles;
create trigger on_profile_insert_stamp_mobile_verified
  before insert on public.profiles
  for each row execute function public.registration_stamp_mobile_verified();

notify pgrst, 'reload schema';
