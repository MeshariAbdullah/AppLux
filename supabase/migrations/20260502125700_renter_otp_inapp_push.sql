-- =====================================================================
-- Renter/session OTP: in-app delivery + push nudge (SMS cost cut)
-- =====================================================================
-- The rental-session OTP returns to IN-APP delivery (the customer
-- reads the code from the RenterOtpCard on Home, exactly the
-- 20260502125100 model — nothing about generation, hashing, expiry,
-- attempts, verification or the P0195 issuance gate changes). What is
-- NEW: when a challenge is created for in-app delivery, the customer
-- gets a PUSH NOTIFICATION telling them a verification code is
-- waiting in the app. The push NEVER contains the code.
--
-- The REGISTRATION OTP (20260502125600) is untouched and keeps SMS.
-- The SMS path for the renter flow (otp-send + get_renter_otp_for_
-- dispatch, 20260502125500) stays deployed and working — otp-send now
-- passes p_delivery => 'sms' so SMS-delivered challenges do NOT also
-- push "open the app" (the code arrives by text instead).
--
-- Pieces:
--   1. notifications type CHECK gains 'renter_otp_ready'.
--   2. push_jobs gains a nullable body column; the push trigger fills
--      it ONLY for this type (existing pushes stay title-only).
--   3. merchant_start_renter_otp is REPLACED (same rules, verbatim
--      body) with an added p_delivery parameter, default 'inapp':
--        'inapp' → insert ONE renter_otp_ready notification per
--                  created challenge (the AFTER INSERT push trigger
--                  turns it into exactly one push job —
--                  on conflict (notification_id) do nothing keeps it
--                  single). Resend = new challenge = one new push.
--        'sms'   → no notification (otp-send delivers by SMS).
--      Existing clients calling with only p_mobile keep working
--      (default applies).
--
-- Idempotent. Additive + function replacement only — no applied
-- migration file is edited.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Notification vocabulary
-- ---------------------------------------------------------------------
-- Same list as 20260502125400 plus renter_otp_ready. The dispute
-- once-per-case unique index is untouched (this type carries no
-- case_id and may repeat per challenge).

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_issued',
  'renter_otp_ready',                -- NEW: in-app rental OTP is waiting
  'dispute_claim_submitted',
  'dispute_customer_accepted',
  'dispute_customer_objected',
  'dispute_proposal_received',
  'dispute_proposal_accepted',
  'dispute_proposal_rejected',
  'dispute_customer_no_response',
  'dispute_moved_to_lend',
  'dispute_lend_proposal',
  'dispute_resolved',
  'dispute_unresolved'
));

-- ---------------------------------------------------------------------
-- (2) Push body (nullable — existing pushes stay title-only)
-- ---------------------------------------------------------------------

alter table public.push_jobs
  add column if not exists body text;

comment on column public.push_jobs.body is
  'Optional push body. NULL for the historical title-only pushes; set only for types whose copy is privacy-safe (never codes, names, amounts).';

-- Push mapping: 20260502125000 body preserved verbatim; adds the
-- renter_otp_ready title/body/route and forwards the body column.
create or replace function public.on_notification_push_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
  v_title text;
  v_body text;
  v_route text;
begin
  select role into v_role from profiles where id = new.user_id;

  -- Generic, privacy-safe title per event family.
  v_title := case
    when new.type = 'renter_otp_ready' then 'رمز تحقق جديد'
    when new.type = 'offer_issued' then 'لديك عرض إيجار جديد'
    when new.type like 'dispute_%' and v_role = 'merchant'
      then 'يوجد تحديث جديد على حالة نزاع'
    when new.type like 'dispute_%'
      then 'لديك تحديث جديد على حالة إيجار'
    else 'لديك إشعار جديد من Lend'
  end;

  -- Body only where the copy is privacy-safe and code-free.
  v_body := case
    when new.type = 'renter_otp_ready'
      then 'وصلك رمز تحقق لإكمال إنشاء عقد إيجار. افتح التطبيق للاطلاع عليه.'
    else null
  end;

  -- Deep link: specific real route when identifiers allow, otherwise
  -- the role's Notifications screen.
  v_route := case
    when new.type = 'renter_otp_ready' then '/home'  -- RenterOtpCard lives here
    when new.type like 'dispute_%' and new.case_id is not null then
      case when v_role = 'merchant'
           then '/merchant/damages/' || new.case_id
           else '/disputes/' || new.case_id end
    when new.type = 'offer_issued' and new.scan_token is not null
      then '/review/' || new.scan_token
    when v_role = 'merchant' then '/merchant/notifications'
    else '/notifications'
  end;

  insert into push_jobs (notification_id, user_id, title, body, route)
  values (new.id, new.user_id, v_title, v_body, v_route)
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (3) merchant_start_renter_otp — delivery-aware (default 'inapp')
-- ---------------------------------------------------------------------
-- 20260502125100 body preserved verbatim; adds p_delivery validation
-- and the one-per-challenge notification for in-app delivery. The
-- code is NEVER placed in the notification.

drop function if exists public.merchant_start_renter_otp(text);
create or replace function public.merchant_start_renter_otp(
  p_mobile   text,
  p_delivery text default 'inapp'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      app_role;
  v_canonical text;
  v_customer  uuid;
  v_code      text;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can start renter verification' using errcode = 'P0030';
  end if;

  if p_delivery not in ('inapp', 'sms') then
    raise exception 'Invalid delivery mode' using errcode = 'P0190';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    raise exception 'Invalid mobile format' using errcode = 'P0190';
  end if;

  -- profiles_mobile_customer_unique guarantees at most one match.
  select id into v_customer
    from public.profiles
   where mobile = v_canonical and role = 'customer';
  if v_customer is null then
    raise exception 'No customer account for this mobile' using errcode = 'P0191';
  end if;

  -- Light throttle: at most one new challenge per merchant+customer
  -- every 15 seconds (double-tap / spam guard).
  if exists (
    select 1 from public.renter_otp_challenges
     where created_by = auth.uid()
       and customer_user_id = v_customer
       and created_at > now() - interval '15 seconds'
  ) then
    raise exception 'Verification code was just issued — wait a moment'
      using errcode = 'P0192';
  end if;

  -- Cryptographically random 6-digit code (pgcrypto). 24 random bits
  -- mod 1e6 — the residual modulo bias is negligible for a 5-attempt,
  -- 10-minute one-time code.
  v_code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(3), 'hex'))::bit(24)::int) % 1000000)::text,
    6, '0');

  -- Supersede any previous open (unverified, unused) challenge for
  -- this pair — exactly one code is live at a time.
  update public.renter_otp_challenges
     set superseded_at = now()
   where created_by = auth.uid()
     and customer_user_id = v_customer
     and verified_at is null
     and superseded_at is null;

  -- code_hash is the verification baseline; code_inapp is the
  -- TEMPORARY plaintext copy for in-app delivery (see table comment).
  insert into public.renter_otp_challenges
    (customer_user_id, mobile, code_hash, code_inapp, expires_at, created_by)
  values (
    v_customer,
    v_canonical,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    v_code,
    now() + interval '10 minutes',
    auth.uid()
  );

  -- In-app delivery: nudge the customer to open the app — exactly one
  -- notification (→ one push job) per created challenge, code-free.
  if p_delivery = 'inapp' then
    insert into public.notifications (user_id, type, merchant_display_name)
    values (
      v_customer,
      'renter_otp_ready',
      (select m.display_name from public.merchants m
        where m.owner_user_id = auth.uid() limit 1)
    );
  end if;
end;
$$;

grant execute on function public.merchant_start_renter_otp(text, text) to authenticated;

comment on function public.merchant_start_renter_otp(text, text) is
  'Starts a customer-presence OTP challenge for the merchant rental session (20260502125100 rules unchanged). p_delivery ''inapp'' (default — client RPC provider): the customer reads the code via get_my_renter_otp and receives a code-free push nudge (renter_otp_ready). ''sms'' (otp-send Edge Function): no nudge; the code arrives by SMS. Never returns the code. P0030 role; P0190 mobile/delivery; P0191 no customer; P0192 throttled.';

notify pgrst, 'reload schema';
