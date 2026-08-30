-- =====================================================================
-- Contract-scoped National ID — identity redesign
-- =====================================================================
-- PRODUCT DECISION: National ID is CONTRACT DATA, not PROFILE DATA.
--
--   ACCOUNT IDENTITY      → phone / account authentication
--   CONTRACT IDENTITY     → National ID entered by the merchant for a
--                           specific rental offer, reviewed by the
--                           customer, frozen on the accepted contract.
--
-- What this migration does (in order):
--
--   1. rental_invoices.lessee_national_id — merchant-entered National
--      ID captured at OFFER CREATION (the contract-preparation step).
--      Format-checked; nullable so historical rows stay valid.
--   2. One-time BACKFILL of the four party-snapshot columns on
--      rental_contracts for legacy contracts created before
--      20260502123500. SEMANTICS: this copies the exact value each
--      contract was already displaying through its live-profile
--      fallback, freezing it as the RECORDED contractual value. It
--      does NOT verify the value and does not imply any government
--      identity verification — recorded value ≠ verified identity.
--   3. Immutability guards — once written, the party snapshot columns
--      on rental_contracts (P0151) and the merchant-entered
--      lessee_national_id on rental_invoices (P0152) cannot be changed
--      by end-user roles, and end-user roles can no longer write
--      profiles.national_id at all (P0153).
--   4. accept_rental_invoice — the lessee National ID snapshot now
--      comes from the INVOICE (merchant-entered, customer-reviewed),
--      falling back to profiles.national_id only for offers issued
--      before this migration (offers expire after 1 hour, so the
--      fallback window is tiny). Everything else is unchanged.
--   5. Customer-presence OTP — renter_otp_challenges +
--      merchant_start_renter_otp / merchant_verify_renter_otp /
--      get_my_renter_otp. Replaces the mobile + "last 4 of National
--      ID" presence check. A cryptographically random 6-digit code is
--      generated server-side per challenge; while no SMS provider is
--      integrated, the code is retrievable ONLY by the CUSTOMER
--      through their own authenticated Lend session (in-app
--      delivery). There is NO fixed code, NO development bypass, and
--      the merchant/client never learns the code from the server.
--   6. SERVER-SIDE ENFORCEMENT — an AFTER INSERT trigger on
--      rental_invoices refuses offer issuance by end-user roles
--      unless a VERIFIED, UNUSED, UNEXPIRED challenge exists binding
--      (this merchant user → this customer), and consumes it in the
--      same transaction (P0195). Calling PostgREST/RPCs directly
--      cannot bypass the OTP step.
--   7. Drops the National-ID-based account verification surface:
--      confirm_renter_presence, merchant_set_customer_national_id,
--      and the has_national_id column of lookup_renter_by_mobile.
--   8. handle_new_auth_user — customer signup no longer reads or
--      persists a National ID. (Merchant signup still records the
--      authorized REPRESENTATIVE's ID — merchant-onboarding
--      compliance data, unrelated to customer identity.)
--   9. Drops profiles_national_id_customer_unique — National ID is no
--      longer an account-identity datum.
--
-- WHY profiles.national_id IS KEPT (column + existing values):
--   * MERCHANT-role profile rows store the authorized REPRESENTATIVE's
--     National ID in this same column — handle_new_auth_user's
--     merchant branch (unchanged, see section 8) still writes it on
--     every merchant signup, in addition to
--     merchant_applications.authorized_national_id. Dropping the
--     column would break merchant onboarding.
--   * CUSTOMER-role values are legacy data retained untouched for
--     reversibility. After this migration nothing writes them (the
--     trigger stops, the client stops, and P0153 blocks end-user
--     writes), and the ONLY remaining reader is the legacy-offer
--     fallback inside accept_rental_invoice (section 4) — explicitly
--     temporary and removable once no pre-migration offers remain
--     (their 1-hour expiry passed). A later cleanup migration may
--     null customer-role values.
--
-- Idempotent throughout. ROLLBACK: re-apply the 20260502123700 body of
-- accept_rental_invoice, the 20260502124400 body of
-- handle_new_auth_user, the 20260502122300 bodies of
-- lookup_renter_by_mobile / merchant_set_customer_national_id, the
-- 20260502120900 body of confirm_renter_presence, re-create index
-- profiles_national_id_customer_unique, and drop the new table,
-- triggers, functions and column.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Merchant-entered National ID on the offer
-- ---------------------------------------------------------------------

alter table public.rental_invoices
  add column if not exists lessee_national_id text;

alter table public.rental_invoices
  drop constraint if exists rental_invoices_lessee_national_id_format;
alter table public.rental_invoices
  add constraint rental_invoices_lessee_national_id_format
  check (lessee_national_id is null or lessee_national_id ~ '^[12][0-9]{9}$');

comment on column public.rental_invoices.lessee_national_id is
  'National ID the MERCHANT recorded for this specific rental offer. Reviewed by the customer during contract review; frozen onto rental_contracts.lessee_national_id at acceptance. A RECORDED value, not a government-verified identity — the customer approves the contract containing it.';

-- ---------------------------------------------------------------------
-- (2) One-time freeze of legacy contract snapshots
-- ---------------------------------------------------------------------
-- Contracts created before 20260502123500 have NULL snapshot columns
-- and the UI fell back to live rows. Freeze them now from the same
-- sources the fallback used, so no historical contract depends on
-- mutable profile/merchant data afterwards. Only NULL columns are
-- touched; snapshots written at acceptance are never rewritten.
--
-- SEMANTICS: the copied lessee_national_id is the value the customer
-- account carried when these contracts were formed and displayed — a
-- RECORDED contractual value. Freezing it here does NOT verify it and
-- must never be presented as a government-verified identity.

update public.rental_contracts c
   set lessor_legal_name = coalesce(c.lessor_legal_name, nullif(trim(m.company_name), '')),
       lessor_cr_number  = coalesce(c.lessor_cr_number,  nullif(trim(m.commercial_reg_number), '')),
       updated_at        = now()
  from public.merchants m
 where m.id = c.merchant_id
   and (c.lessor_legal_name is null or c.lessor_cr_number is null);

update public.rental_contracts c
   set lessee_legal_name  = coalesce(c.lessee_legal_name,  nullif(trim(p.full_name), '')),
       lessee_national_id = coalesce(c.lessee_national_id, nullif(trim(p.national_id), '')),
       updated_at         = now()
  from public.profiles p
 where p.id = c.customer_user_id
   and (c.lessee_legal_name is null or c.lessee_national_id is null);

-- ---------------------------------------------------------------------
-- (3) Immutability guards
-- ---------------------------------------------------------------------
-- rental_contracts_merchant_update / admin RLS policies allow whole-row
-- updates, so without a guard a later edit could silently change what
-- an ACCEPTED contract says. Freeze the four party identifiers for
-- end-user roles once they hold a value. SECURITY DEFINER functions
-- (lifecycle RPCs, this migration's backfill) run as the function
-- owner, not 'authenticated', so they are unaffected.

create or replace function public.guard_contract_party_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (old.lessor_legal_name  is not null and new.lessor_legal_name  is distinct from old.lessor_legal_name)
       or (old.lessor_cr_number   is not null and new.lessor_cr_number   is distinct from old.lessor_cr_number)
       or (old.lessee_legal_name  is not null and new.lessee_legal_name  is distinct from old.lessee_legal_name)
       or (old.lessee_national_id is not null and new.lessee_national_id is distinct from old.lessee_national_id) then
      raise exception 'Contract party identity snapshots are immutable'
        using errcode = 'P0151';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rental_contracts_guard_party_snapshot on public.rental_contracts;
create trigger rental_contracts_guard_party_snapshot
  before update on public.rental_contracts
  for each row
  execute function public.guard_contract_party_snapshot();

-- The offer's merchant-entered National ID is what the customer
-- reviews; correcting a typo means cancelling and reissuing the offer
-- (offers expire after 1 hour anyway). Freeze it post-insert for
-- end-user roles so the reviewed value can never drift silently.

create or replace function public.guard_invoice_lessee_national_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.lessee_national_id is distinct from old.lessee_national_id then
      raise exception 'The offer National ID cannot be changed after issuance — cancel and reissue'
        using errcode = 'P0152';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rental_invoices_guard_lessee_national_id on public.rental_invoices;
create trigger rental_invoices_guard_lessee_national_id
  before update on public.rental_invoices
  for each row
  execute function public.guard_invoice_lessee_national_id();

-- profiles.national_id is no longer writable by end-user roles at all:
-- no client flow writes it any more (customer signup stopped, the
-- merchant backfill RPC is dropped below), so any remaining write path
-- through the permissive profiles self-update RLS policy would be a
-- regression. Merchant signup still populates it, but through the
-- SECURITY DEFINER trigger (runs as the function owner — unaffected).

create or replace function public.guard_profile_national_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.national_id is distinct from old.national_id then
      raise exception 'profiles.national_id is not writable — National ID is contract data'
        using errcode = 'P0153';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_national_id on public.profiles;
create trigger profiles_guard_national_id
  before update on public.profiles
  for each row
  execute function public.guard_profile_national_id();

-- ---------------------------------------------------------------------
-- (4) accept_rental_invoice — snapshot the INVOICE's National ID
-- ---------------------------------------------------------------------
-- Identical to the 20260502123700 body except the lessee National ID
-- source: invoice first (merchant-entered, customer-reviewed), profile
-- only as a fallback for offers issued before this migration.
-- >>> TEMPORARY LEGACY READER: the profiles.national_id fallback below
-- is the ONLY remaining live reader of customer profile National IDs.
-- It exists solely for offers issued before this migration that are
-- still inside their 1-hour acceptance window, and can be deleted in
-- any later migration once that window has passed. <<<

create or replace function public.accept_rental_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice          rental_invoices%rowtype;
  v_contract_id      uuid;
  v_contract_number  text;
  v_rental_days      int;
  v_start_date       date;
  v_lessor_name      text;
  v_lessor_cr        text;
  v_lessee_name      text;
  v_lessee_nid       text;
  v_limit            numeric;
  v_used             numeric;
  v_reserved_others  numeric;
  v_exposure         numeric;
begin
  -- Row lock: accept/reject/cancel serialize here — one winner.
  select * into v_invoice
    from rental_invoices
   where id = p_invoice_id
     for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0001';
  end if;

  if v_invoice.customer_user_id is distinct from auth.uid() then
    raise exception 'You can only accept your own invoice' using errcode = 'P0002';
  end if;

  if v_invoice.status not in ('issued', 'viewed') then
    raise exception 'Invoice is not in an acceptable state (got %)', v_invoice.status
      using errcode = 'P0003';
  end if;

  -- Server-side expiry gate — client clocks are irrelevant.
  if v_invoice.expires_at is not null and v_invoice.expires_at <= now() then
    raise exception 'Offer expired — acceptance is no longer available'
      using errcode = 'P0170';
  end if;

  -- Party identity snapshots. Lessee National ID: the value the
  -- MERCHANT entered on this offer and the customer just reviewed.
  select company_name, commercial_reg_number
    into v_lessor_name, v_lessor_cr
    from merchants where id = v_invoice.merchant_id;
  select full_name
    into v_lessee_name
    from profiles where id = v_invoice.customer_user_id;
  v_lessee_nid := nullif(trim(coalesce(v_invoice.lessee_national_id, '')), '');
  if v_lessee_nid is null then
    -- TEMPORARY legacy fallback (see header of this section).
    select nullif(trim(coalesce(national_id, '')), '') into v_lessee_nid
      from profiles where id = v_invoice.customer_user_id;
  end if;

  if coalesce(trim(v_lessor_name), '') = ''
     or coalesce(trim(v_lessor_cr), '') = ''
     or coalesce(trim(v_lessee_name), '') = ''
     or v_lessee_nid is null then
    raise exception 'Contract party identity details are incomplete'
      using errcode = 'P0150';
  end if;

  -- Eligibility backstop (20260502123600) — unchanged.
  select limit_amount, used_amount
    into v_limit, v_used
    from rental_eligibility
   where user_id = v_invoice.customer_user_id
     for update;
  if not found then
    raise exception 'Customer has no rental eligibility'
      using errcode = 'P0161';
  end if;
  v_exposure := coalesce(nullif(v_invoice.original_item_value, 0), v_invoice.total_amount, 0);
  v_reserved_others := eligibility_reserved_amount(v_invoice.customer_user_id, v_invoice.id);
  if v_exposure > v_limit - v_used - v_reserved_others then
    raise exception 'Offer exposure exceeds available eligibility at acceptance'
      using errcode = 'P0161';
  end if;

  v_contract_number := next_contract_number();

  select max(rental_days) into v_rental_days
  from rental_invoice_items
  where invoice_id = v_invoice.id;
  v_rental_days := coalesce(v_rental_days, 30);

  v_start_date := coalesce(v_invoice.starts_at::date, current_date);

  insert into rental_contracts (
    contract_number, invoice_id, customer_user_id, merchant_id, branch_id,
    start_date, end_date,
    rental_fee_amount, security_deposit, total_amount,
    lessor_legal_name, lessor_cr_number, lessee_legal_name, lessee_national_id,
    status, signed_at
  )
  values (
    v_contract_number, v_invoice.id, v_invoice.customer_user_id, v_invoice.merchant_id, v_invoice.branch_id,
    v_start_date,
    v_start_date + (v_rental_days || ' days')::interval,
    v_invoice.subtotal_amount, v_invoice.security_deposit, v_invoice.total_amount,
    trim(v_lessor_name), trim(v_lessor_cr), trim(v_lessee_name), v_lessee_nid,
    'pending', null
  )
  returning id into v_contract_id;

  update rental_invoices
  set status = 'accepted', updated_at = now()
  where id = p_invoice_id;

  return v_contract_id;
end;
$$;

grant execute on function public.accept_rental_invoice(uuid) to authenticated;

comment on function public.accept_rental_invoice(uuid) is
  'Accept issued/viewed invoice → pending contract (row-locked; LND ref + party snapshots + eligibility backstop). Lessee National ID snapshot comes from the invoice (merchant-entered, customer-reviewed); profile fallback only for pre-20260502125100 offers. P0170 expired; P0003 non-actionable; P0150 identity; P0161 eligibility; P0001/P0002 unchanged.';

-- ---------------------------------------------------------------------
-- (5) Customer-presence OTP
-- ---------------------------------------------------------------------
-- Model: the merchant enters the customer's mobile; the server
-- generates a RANDOM one-time code for that customer's account; the
-- CUSTOMER retrieves the code inside their own authenticated Lend app
-- (get_my_renter_otp) and tells it to the merchant; the merchant
-- enters it; verification succeeds only when the code matches
-- server-side. Success means "presence of the person controlling the
-- registered Lend account/mobile was confirmed for this in-store
-- session" — it is NOT a National ID or government identity
-- verification.
--
-- SECURITY MODEL (no fixed code, no bypass):
--   * The code is generated with pgcrypto randomness per challenge and
--     never returned to the merchant-side caller by any RPC.
--   * VERIFICATION IS HASH-BASED: only sha256(code) is compared; the
--     plaintext exists solely in the TEMPORARY code_inapp column that
--     powers in-app delivery, and is dropped with SMS integration
--     (see the column comment on renter_otp_challenges.code_inapp).
--   * The ONLY read path is get_my_renter_otp, which returns a code
--     exclusively for auth.uid() = the challenge's customer — i.e.
--     the person logged into the customer's own Lend account. A
--     merchant (or attacker) calling the RPCs directly learns nothing.
--   * The table has RLS enabled with no policies and all client
--     privileges revoked; only the SECURITY DEFINER RPCs touch it.
--   * Challenge lifecycle: 10-minute code validity, 5 verify attempts,
--     supersession on re-send, and single-use consumption AT OFFER
--     ISSUANCE (section 6).
--
-- PRODUCTION SEAM (real OTP later): replace the in-app delivery with
-- SMS — either extend merchant_start_renter_otp to hand the generated
-- code to an SMS sender, or switch the client's src/lib/otp provider
-- to the pre-existing otp-send / otp-verify Twilio edge functions. The
-- verify semantics, binding, and issuance enforcement stay unchanged.

create table if not exists public.renter_otp_challenges (
  id                uuid primary key default gen_random_uuid(),
  customer_user_id  uuid not null references public.profiles(id) on delete cascade,
  mobile            text not null,
  -- VERIFICATION BASELINE: sha256 of the code. This is what
  -- merchant_verify_renter_otp compares against — the plaintext is
  -- never needed for verification.
  code_hash         text not null,
  -- >>> TEMPORARY — IN-APP DELIVERY ONLY <<<
  -- Plaintext copy of the code, read exclusively by get_my_renter_otp
  -- so the CUSTOMER can see their own code inside the app while no SMS
  -- provider is integrated (a hash cannot be displayed, and the code
  -- must be stable between issuance and verification, so a plaintext
  -- copy is unavoidable for this delivery mode). When SMS/Twilio
  -- delivery ships (the code is handed to the SMS sender at issuance
  -- instead), DROP this column and the get_my_renter_otp function —
  -- verification via code_hash is unaffected. Access is definer-only
  -- and rows live at most 10 minutes as usable codes.
  code_inapp        text not null,
  attempts          int  not null default 0,
  expires_at        timestamptz not null,
  -- Set by merchant_verify_renter_otp on a correct code.
  verified_at       timestamptz,
  -- Set when a newer challenge replaces this (unverified) one.
  superseded_at     timestamptz,
  -- Single-use consumption: stamped by the issuance trigger (section
  -- 6) with the offer this verification was spent on.
  used_invoice_id   uuid references public.rental_invoices(id) on delete set null,
  used_at           timestamptz,
  created_by        uuid not null references public.profiles(id) on delete cascade,
  created_at        timestamptz not null default now()
);

create index if not exists renter_otp_challenges_lookup_idx
  on public.renter_otp_challenges(created_by, customer_user_id, created_at desc);
create index if not exists renter_otp_challenges_customer_idx
  on public.renter_otp_challenges(customer_user_id, created_at desc);

-- No client access at all — the SECURITY DEFINER RPCs are the only
-- surface. (Definer functions run as the table owner and are not
-- subject to these policies.)
alter table public.renter_otp_challenges enable row level security;
revoke all on public.renter_otp_challenges from anon, authenticated;

create or replace function public.merchant_start_renter_otp(p_mobile text)
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
end;
$$;

grant execute on function public.merchant_start_renter_otp(text) to authenticated;

comment on function public.merchant_start_renter_otp(text) is
  'Starts a customer-presence OTP challenge for the merchant rental session: generates a random 6-digit code retrievable ONLY by the customer via get_my_renter_otp (in-app delivery until SMS integration). Never returns the code to the caller. P0030 role; P0190 mobile format; P0191 no customer; P0192 throttled.';

create or replace function public.merchant_verify_renter_otp(
  p_mobile text,
  p_code   text
)
returns table (
  id           uuid,
  full_name    text,
  mobile       text,
  city         text,
  has_nafath   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      app_role;
  v_canonical text;
  v_customer  uuid;
  v_challenge public.renter_otp_challenges%rowtype;
  v_clean     text;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can verify renter presence' using errcode = 'P0030';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    raise exception 'Invalid mobile format' using errcode = 'P0190';
  end if;

  select p.id into v_customer
    from public.profiles p
   where p.mobile = v_canonical and p.role = 'customer';
  if v_customer is null then
    raise exception 'No customer account for this mobile' using errcode = 'P0191';
  end if;

  -- Latest open challenge issued by THIS merchant for THIS customer.
  select * into v_challenge
    from public.renter_otp_challenges c
   where c.created_by = auth.uid()
     and c.customer_user_id = v_customer
     and c.verified_at is null
     and c.superseded_at is null
   order by c.created_at desc
   limit 1
   for update;

  if not found or v_challenge.expires_at <= now() then
    raise exception 'No active verification code — request a new one'
      using errcode = 'P0193';
  end if;

  if v_challenge.attempts >= 5 then
    raise exception 'Too many attempts — request a new code'
      using errcode = 'P0194';
  end if;

  update public.renter_otp_challenges
     set attempts = attempts + 1
   where renter_otp_challenges.id = v_challenge.id;

  v_clean := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if v_clean = ''
     or encode(extensions.digest(convert_to(v_clean, 'UTF8'), 'sha256'), 'hex')
        is distinct from v_challenge.code_hash then
    -- Wrong code: zero rows (the client shows "code incorrect"). The
    -- attempt was already counted above. Verification compares hashes
    -- only — the plaintext column plays no part here.
    return;
  end if;

  -- Correct code — mark VERIFIED (not consumed: consumption happens
  -- when the merchant issues the offer, section 6) and return the
  -- customer's safe profile fields. Same disclosure boundary as
  -- before: nothing identifying pre-verification.
  update public.renter_otp_challenges
     set verified_at = now()
   where renter_otp_challenges.id = v_challenge.id;

  return query
  select p.id,
         p.full_name,
         p.mobile,
         p.city,
         (p.nafath_verified_at is not null)
    from public.profiles p
   where p.id = v_customer;
end;
$$;

grant execute on function public.merchant_verify_renter_otp(text, text) to authenticated;

comment on function public.merchant_verify_renter_otp(text, text) is
  'Verifies the customer-presence OTP for the merchant rental session; on success marks the challenge VERIFIED (consumed later, at offer issuance) and returns the customer''s safe profile fields (zero rows on a wrong code). Confirms control of the registered Lend account/mobile ONLY — not a National ID or government identity verification. P0030 role; P0190 mobile; P0191 no customer; P0193 no active/expired challenge; P0194 attempt cap.';

-- The customer's read path — in-app delivery of their own pending
-- code. Strictly scoped to auth.uid(): nobody else (merchant included)
-- can retrieve a code from the server.
create or replace function public.get_my_renter_otp()
returns table (
  code           text,
  expires_at     timestamptz,
  merchant_name  jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0080';
  end if;

  return query
  select c.code_inapp,
         c.expires_at,
         m.display_name
    from public.renter_otp_challenges c
    left join public.merchants m on m.owner_user_id = c.created_by
   where c.customer_user_id = auth.uid()
     and c.verified_at is null
     and c.superseded_at is null
     and c.expires_at > now()
   order by c.created_at desc
   limit 1;
end;
$$;

grant execute on function public.get_my_renter_otp() to authenticated;

comment on function public.get_my_renter_otp() is
  'TEMPORARY in-app OTP delivery: returns the calling CUSTOMER''s own pending verification code (latest open, unexpired, unsuperseded, unverified challenge) plus the requesting boutique''s display name. Zero rows when none is pending. Scoped to auth.uid() — the ONLY read path for code_inapp. Drop together with the code_inapp column when SMS delivery ships; hash-based verification is unaffected.';

-- ---------------------------------------------------------------------
-- (6) Server-side enforcement: no offer issuance without verified OTP
-- ---------------------------------------------------------------------
-- Offers are created by a direct merchant INSERT into rental_invoices
-- (RLS rental_invoices_merchant_insert; there is no insert RPC and no
-- admin insert policy). This AFTER INSERT trigger is therefore THE
-- enforcement point: for end-user roles, the insert commits only when
-- a challenge exists that is
--   * created by the inserting auth user (the merchant owner — RLS
--     already guarantees auth.uid() owns NEW.merchant_id),
--   * for exactly NEW.customer_user_id (which the start RPC resolved
--     from the verified mobile),
--   * VERIFIED within the last 30 minutes (one in-store session),
--   * not yet spent on another invoice,
-- and that challenge is consumed (used_invoice_id = the new offer) in
-- the same transaction. FOR UPDATE serializes concurrent inserts, so
-- one verification can never issue two offers.
--
-- Caller detection: this function is SECURITY DEFINER (it must read
-- the privilege-revoked challenges table), which switches current_user
-- to the function owner — so end-user requests are detected via
-- auth.uid() (present exactly when a JWT-authenticated PostgREST
-- request performs the insert; RLS guarantees that user owns
-- NEW.merchant_id). Privileged writers (seeds, SQL editor, service
-- role) carry no JWT → auth.uid() is null → unaffected.

create or replace function public.enforce_renter_otp_on_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select c.id into v_challenge_id
    from public.renter_otp_challenges c
   where c.created_by = auth.uid()
     and c.customer_user_id = new.customer_user_id
     and c.verified_at is not null
     and c.verified_at > now() - interval '30 minutes'
     and c.used_invoice_id is null
   order by c.verified_at desc
   limit 1
   for update;

  if v_challenge_id is null then
    raise exception 'Customer verification required — complete the OTP step before issuing'
      using errcode = 'P0195';
  end if;

  update public.renter_otp_challenges
     set used_invoice_id = new.id,
         used_at         = now()
   where id = v_challenge_id;

  return new;
end;
$$;

drop trigger if exists rental_invoices_enforce_renter_otp on public.rental_invoices;
create trigger rental_invoices_enforce_renter_otp
  after insert on public.rental_invoices
  for each row
  execute function public.enforce_renter_otp_on_invoice();

comment on function public.enforce_renter_otp_on_invoice() is
  'Server-side OTP gate for offer issuance: an end-user INSERT into rental_invoices requires a challenge verified by the same merchant user for the same customer within 30 minutes and not yet spent; the challenge is consumed (single-use) in the same transaction. P0195 otherwise. Direct PostgREST calls cannot bypass the OTP step.';

-- ---------------------------------------------------------------------
-- (7) Remove the National-ID-based account verification surface
-- ---------------------------------------------------------------------

drop function if exists public.confirm_renter_presence(text, text);
drop function if exists public.merchant_set_customer_national_id(uuid, text, text);

-- lookup_renter_by_mobile loses has_national_id (return-type change
-- requires drop + recreate). Existence-check semantics unchanged.
drop function if exists public.lookup_renter_by_mobile(text);
create function public.lookup_renter_by_mobile(p_mobile text)
returns table (
  id          uuid,
  has_nafath  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role app_role;
  v_canonical text;
begin
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can look up renters' using errcode = 'P0030';
  end if;

  v_canonical := public.canonicalize_saudi_mobile(p_mobile);
  if v_canonical is null then
    return;
  end if;

  return query
  select p.id, (p.nafath_verified_at is not null)
    from public.profiles p
   where p.mobile = v_canonical
     and p.role = 'customer'
   limit 1;
end;
$$;

grant execute on function public.lookup_renter_by_mobile(text) to authenticated;

-- ---------------------------------------------------------------------
-- (8) Customer signup no longer touches National ID
-- ---------------------------------------------------------------------
-- Identical to the 20260502124400 body except the CUSTOMER branch stops
-- reading raw_user_meta_data->>'national_id' (the client no longer
-- sends it). The MERCHANT branch still records the authorized
-- representative's National ID — merchant-onboarding compliance data,
-- deliberately unchanged (this is also why profiles.national_id must
-- remain a column: merchant-role rows keep receiving the rep ID here).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload      jsonb;
  v_branches     jsonb;
  v_branch       jsonb;
  v_cats         jsonb;
  v_cat_txt      text;
  v_unified      text;
  v_rep_id       text;
  v_mobile       text;
  v_primary      public.rental_category;
  v_one_cat      public.rental_category;
  v_app_id       uuid;
  v_pos          int := 0;
  v_map          text;
  v_receipt      text;
  v_token_hash   text;
  v_ticket       public.merchant_upload_tickets%rowtype;
  c_map_re       text := '^https://([a-z0-9-]+\.)*(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)';
begin
  if new.raw_user_meta_data->>'account_type' = 'merchant' then
    -- ============ MERCHANT SIGNUP (unchanged) ============
    v_payload := nullif(current_setting('lend.merchant_signup_payload', true), '')::jsonb;
    if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
      raise exception 'Merchant signup payload missing' using errcode = 'P0120';
    end if;

    if coalesce(trim(v_payload->>'company_name'), '') = '' then
      raise exception 'Merchant signup: company name required' using errcode = 'P0120';
    end if;
    if coalesce(trim(v_payload->>'authorized_name'), '') = '' then
      raise exception 'Merchant signup: authorized name required' using errcode = 'P0120';
    end if;

    v_unified := regexp_replace(coalesce(v_payload->>'unified_number', ''), '\D', '', 'g');
    if v_unified !~ '^700[0-9]{7}$' then
      raise exception 'Merchant signup: invalid unified number' using errcode = 'P0120';
    end if;

    v_rep_id := regexp_replace(coalesce(v_payload->>'authorized_national_id', ''), '\D', '', 'g');
    if v_rep_id !~ '^[12][0-9]{9}$' then
      raise exception 'Merchant signup: invalid representative national id' using errcode = 'P0120';
    end if;

    v_mobile := public.canonicalize_saudi_mobile(v_payload->>'contact_mobile');
    if v_mobile is null then
      raise exception 'Merchant signup: invalid contact mobile' using errcode = 'P0120';
    end if;

    v_cats := v_payload->'categories';
    if v_cats is null or jsonb_typeof(v_cats) <> 'array' or jsonb_array_length(v_cats) < 1 then
      if coalesce(trim(v_payload->>'category'), '') <> '' then
        v_cats := jsonb_build_array(v_payload->>'category');
      else
        raise exception 'Merchant signup: at least one activity required' using errcode = 'P0120';
      end if;
    end if;
    begin
      v_primary := (v_cats->>0)::public.rental_category;
    exception when others then
      raise exception 'Merchant signup: invalid category' using errcode = 'P0120';
    end;

    v_branches := v_payload->'branches';
    if v_branches is null
       or jsonb_typeof(v_branches) <> 'array'
       or jsonb_array_length(v_branches) < 1 then
      raise exception 'Merchant signup: at least one branch required' using errcode = 'P0120';
    end if;

    v_receipt := nullif(trim(v_payload->>'doc_receipt'), '');
    if v_receipt is null then
      raise exception 'Merchant signup: CR document required' using errcode = 'P0120';
    end if;
    v_token_hash := encode(extensions.digest(convert_to(v_receipt, 'UTF8'), 'sha256'), 'hex');
    select * into v_ticket
      from public.merchant_upload_tickets
     where token_hash = v_token_hash
     for update;
    if not found
       or v_ticket.status <> 'uploaded'
       or v_ticket.expires_at <= now()
       or v_ticket.doc_type <> 'commercial_registration'
       or v_ticket.storage_path is null then
      raise exception 'Merchant signup: invalid or expired document receipt' using errcode = 'P0120';
    end if;

    insert into public.profiles (id, full_name, email, mobile, national_id, city, role, account_status)
    values (
      new.id,
      coalesce(trim(v_payload->>'authorized_name'), new.email),
      new.email,
      null,
      v_rep_id,
      v_branches->0->>'city',
      'merchant',
      'pending'
    )
    on conflict (id) do nothing;

    insert into public.merchant_applications (
      applicant_user_id, company_name, commercial_reg_number, unified_number,
      authorized_name, authorized_national_id, city, primary_category,
      contact_email, contact_phone, status
    ) values (
      new.id,
      trim(v_payload->>'company_name'),
      null,
      v_unified,
      trim(v_payload->>'authorized_name'),
      v_rep_id,
      coalesce(nullif(trim(v_branches->0->>'city'), ''), 'riyadh'),
      v_primary,
      coalesce(nullif(trim(v_payload->>'contact_email'), ''), new.email),
      v_mobile,
      'pending'
    )
    returning id into v_app_id;

    for v_cat_txt in select jsonb_array_elements_text(v_cats) loop
      begin
        v_one_cat := v_cat_txt::public.rental_category;
      exception when others then
        raise exception 'Merchant signup: invalid category' using errcode = 'P0120';
      end;
      insert into public.merchant_application_activities (application_id, category, position)
      values (v_app_id, v_one_cat, v_pos)
      on conflict do nothing;
      v_pos := v_pos + 1;
    end loop;

    v_pos := 0;
    for v_branch in select * from jsonb_array_elements(v_branches) loop
      if coalesce(trim(v_branch->>'name'), '') = ''
         or coalesce(trim(v_branch->>'city'), '') = ''
         or coalesce(trim(v_branch->>'address'), '') = '' then
        raise exception 'Merchant signup: branch name/city/address required' using errcode = 'P0120';
      end if;
      v_map := nullif(trim(coalesce(v_branch->>'map_url', '')), '');
      if v_map is null or v_map !~* c_map_re then
        raise exception 'Merchant signup: invalid branch map link' using errcode = 'P0120';
      end if;
      insert into public.merchant_application_branches
        (application_id, name, city, address, phone, map_url, position)
      values (
        v_app_id,
        trim(v_branch->>'name'),
        trim(v_branch->>'city'),
        trim(v_branch->>'address'),
        nullif(trim(coalesce(v_branch->>'phone', '')), ''),
        v_map,
        v_pos
      );
      v_pos := v_pos + 1;
    end loop;

    update public.merchant_upload_tickets
       set status = 'claimed', claimed_at = now(), claimed_application_id = v_app_id
     where id = v_ticket.id;

    insert into public.merchant_documents (
      application_id, doc_type, storage_path, original_name,
      mime_type, file_size, upload_status, review_status
    ) values (
      v_app_id, 'commercial_registration', v_ticket.storage_path,
      coalesce(v_ticket.original_name, 'commercial-registration'),
      coalesce(v_ticket.mime_type, 'application/octet-stream'),
      coalesce(v_ticket.file_size, 0), 'claimed', 'pending'
    )
    on conflict (application_id, doc_type) where application_id is not null
      do nothing;

  else
    -- ============ CUSTOMER SIGNUP ============
    -- Account identity is name + mobile + email only. National ID is
    -- contract data (entered per rental offer) — NEVER collected or
    -- persisted at signup.
    insert into public.profiles (id, full_name, email, mobile)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.email,
      public.canonicalize_saudi_mobile(new.raw_user_meta_data->>'mobile')
    )
    on conflict (id) do nothing;

    insert into public.rental_eligibility (user_id, limit_amount, used_amount, tier)
    values (new.id, 100000, 0, 'standard')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (9) National ID is no longer an account-identity datum
-- ---------------------------------------------------------------------
-- The partial unique index enforced one-customer-per-National-ID at the
-- ACCOUNT level. Contract-level data has no such account constraint.
-- Existing profiles.national_id values are kept (see header).

drop index if exists public.profiles_national_id_customer_unique;

notify pgrst, 'reload schema';
