-- =====================================================================
-- Lend — customer dashboard test scenarios
-- =====================================================================
-- Idempotent seed that creates four customer accounts (one per realistic
-- dashboard state) plus the shared merchant they transact with. Paste
-- the whole file into the Supabase SQL Editor and run.
--
-- All inserts use fixed UUIDs and `on conflict do update`, so re-running
-- this file leaves the database in the same state. To wipe these rows,
-- run the companion file supabase/seeds/customer_scenarios_reset.sql.
--
-- Test accounts (password is `Lend!2026` for all four):
--
--   1. new+customer@lend.test       — empty dashboard, eligibility only
--   2. active+customer@lend.test    — one active contract / note / invoice
--   3. history+customer@lend.test   — finished rentals only
--   4. action+customer@lend.test    — invoice waiting on acceptance
--
-- The shared counterparty is a single seeded merchant in Riyadh:
--   "بيت الفساتين" / "House of Dresses"
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Fixed UUIDs — referenced from multiple places, kept here for clarity
-- ---------------------------------------------------------------------

-- Merchant + owner profile
-- 11111111-…0001 = merchant owner profile
-- 11111111-…0002 = merchants row
-- Customer profiles
-- 22222222-…0001 = new customer
-- 22222222-…0002 = active customer
-- 22222222-…0003 = history customer
-- 22222222-…0004 = action-required customer

-- ---------------------------------------------------------------------
-- 0. Seed merchant owner (auth.users + profile + merchant)
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111110001',
  'authenticated', 'authenticated',
  'merchant+seed@lend.test',
  crypt('Lend!2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"House of Dresses Owner"}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do update
  set email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data;

update public.profiles
   set full_name = 'House of Dresses Owner',
       role = 'merchant',
       account_status = 'active',
       city = 'الرياض',
       mobile = '0500000001'
 where id = '11111111-1111-1111-1111-111111110001';

insert into public.merchants (
  id, owner_user_id, company_name, commercial_reg_number,
  display_name, about, primary_category, city,
  verified, rating, rating_count, status, approved_at
)
values (
  '11111111-1111-1111-1111-111111110002',
  '11111111-1111-1111-1111-111111110001',
  'House of Dresses Trading Co.',
  'CR-1010000001',
  '{"ar":"بيت الفساتين","en":"House of Dresses"}'::jsonb,
  '{"ar":"بوتيك مختار لفساتين السهرة في الرياض.","en":"A curated evening-dress boutique in Riyadh."}'::jsonb,
  'dress', 'الرياض',
  true, 4.7, 128, 'active', now() - interval '180 days'
)
on conflict (id) do update
  set display_name = excluded.display_name,
      about = excluded.about,
      verified = excluded.verified,
      rating = excluded.rating,
      rating_count = excluded.rating_count,
      status = excluded.status;

-- ---------------------------------------------------------------------
-- Helper: create a customer auth user + activate the auto-created profile.
-- Inlined four times below — keeps each scenario self-contained and
-- readable in the SQL Editor (no temp functions to clean up).
-- ---------------------------------------------------------------------

-- =====================================================================
-- SCENARIO 1 — new customer (empty dashboard)
-- =====================================================================

insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222220001',
  'authenticated', 'authenticated',
  'new+customer@lend.test',
  crypt('Lend!2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"نورة العتيبي"}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do update
  set email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data;

update public.profiles
   set full_name = 'نورة العتيبي',
       role = 'customer',
       account_status = 'active',
       city = 'الرياض',
       mobile = '0551110001',
       national_id = '1011111101'
 where id = '22222222-2222-2222-2222-222222220001';

insert into public.rental_eligibility (
  user_id, limit_amount, used_amount, tier, assigned_at
)
values (
  '22222222-2222-2222-2222-222222220001',
  25000, 0, 'standard', now() - interval '7 days'
)
on conflict (user_id) do update
  set limit_amount = excluded.limit_amount,
      used_amount = excluded.used_amount,
      tier = excluded.tier;

-- =====================================================================
-- SCENARIO 2 — active customer (one live rental)
-- =====================================================================

insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222220002',
  'authenticated', 'authenticated',
  'active+customer@lend.test',
  crypt('Lend!2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"ريم القحطاني"}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do update
  set email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data;

update public.profiles
   set full_name = 'ريم القحطاني',
       role = 'customer',
       account_status = 'active',
       city = 'الرياض',
       mobile = '0551110002',
       national_id = '1011111102'
 where id = '22222222-2222-2222-2222-222222220002';

insert into public.rental_eligibility (
  user_id, limit_amount, used_amount, tier, assigned_at
)
values (
  '22222222-2222-2222-2222-222222220002',
  50000, 18500, 'premium', now() - interval '90 days'
)
on conflict (user_id) do update
  set limit_amount = excluded.limit_amount,
      used_amount = excluded.used_amount,
      tier = excluded.tier;

-- Accepted invoice → active contract → signed note (all fixed UUIDs).
insert into public.rental_invoices (
  id, invoice_number, merchant_id, customer_user_id,
  subtotal_amount, tax_amount, security_deposit, total_amount,
  status, issued_at, expires_at, notes
)
values (
  '33333333-3333-3333-3333-330000000201',
  'INV-200001',
  '11111111-1111-1111-1111-111111110002',
  '22222222-2222-2222-2222-222222220002',
  16000, 2400, 3000, 18400,
  'accepted', now() - interval '8 days', now() + interval '22 days',
  'فستان سهرة شامبانيا — تأجير شهر كامل'
)
on conflict (id) do update
  set status = excluded.status,
      total_amount = excluded.total_amount,
      issued_at = excluded.issued_at,
      expires_at = excluded.expires_at;

insert into public.rental_invoice_items (
  id, invoice_id, position, item_name, category,
  size_label, color, daily_rate, rental_days,
  subtotal, replacement_value
)
values (
  '44444444-4444-4444-4444-440000000201',
  '33333333-3333-3333-3333-330000000201',
  0, 'فستان سهرة شامبانيا', 'dress',
  '38', 'شامبانيا', 533.33, 30,
  16000, 12000
)
on conflict (id) do update
  set item_name = excluded.item_name,
      subtotal = excluded.subtotal;

insert into public.rental_contracts (
  id, contract_number, invoice_id,
  customer_user_id, merchant_id,
  start_date, end_date,
  rental_fee_amount, security_deposit, total_amount,
  status, signed_at
)
values (
  '55555555-5555-5555-5555-550000000201',
  'CT-200001',
  '33333333-3333-3333-3333-330000000201',
  '22222222-2222-2222-2222-222222220002',
  '11111111-1111-1111-1111-111111110002',
  current_date - 8, current_date + 22,
  16000, 3000, 18400,
  'active', now() - interval '8 days'
)
on conflict (id) do update
  set status = excluded.status,
      signed_at = excluded.signed_at,
      end_date = excluded.end_date;

insert into public.promissory_notes (
  id, reference_number, contract_id,
  customer_user_id, merchant_id,
  beneficiary_name, principal_amount, due_date,
  status, signed_at
)
values (
  '66666666-6666-6666-6666-660000000201',
  'PN-200001',
  '55555555-5555-5555-5555-550000000201',
  '22222222-2222-2222-2222-222222220002',
  '11111111-1111-1111-1111-111111110002',
  'House of Dresses Trading Co.',
  18400, current_date + 30,
  'signed', now() - interval '8 days'
)
on conflict (id) do update
  set status = excluded.status,
      principal_amount = excluded.principal_amount,
      due_date = excluded.due_date;

-- =====================================================================
-- SCENARIO 3 — history customer (only finished rentals)
-- =====================================================================

insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222220003',
  'authenticated', 'authenticated',
  'history+customer@lend.test',
  crypt('Lend!2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"سارة الزهراني"}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do update
  set email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data;

update public.profiles
   set full_name = 'سارة الزهراني',
       role = 'customer',
       account_status = 'active',
       city = 'جدة',
       mobile = '0551110003',
       national_id = '1011111103'
 where id = '22222222-2222-2222-2222-222222220003';

insert into public.rental_eligibility (
  user_id, limit_amount, used_amount, tier, assigned_at
)
values (
  '22222222-2222-2222-2222-222222220003',
  35000, 0, 'standard', now() - interval '210 days'
)
on conflict (user_id) do update
  set limit_amount = excluded.limit_amount,
      used_amount = excluded.used_amount,
      tier = excluded.tier;

-- First ended rental (~3 months ago)
insert into public.rental_invoices (
  id, invoice_number, merchant_id, customer_user_id,
  subtotal_amount, tax_amount, security_deposit, total_amount,
  status, issued_at, expires_at, notes
)
values (
  '33333333-3333-3333-3333-330000000301',
  'INV-300001',
  '11111111-1111-1111-1111-111111110002',
  '22222222-2222-2222-2222-222222220003',
  9500, 1425, 2000, 10925,
  'accepted', now() - interval '120 days', now() - interval '90 days',
  'فستان زفاف — تأجير شهر'
)
on conflict (id) do update set status = excluded.status;

insert into public.rental_invoice_items (
  id, invoice_id, position, item_name, category,
  size_label, color, daily_rate, rental_days, subtotal, replacement_value
)
values (
  '44444444-4444-4444-4444-440000000301',
  '33333333-3333-3333-3333-330000000301',
  0, 'فستان زفاف عاجي', 'dress',
  '36', 'عاجي', 316.66, 30, 9500, 18000
)
on conflict (id) do update set item_name = excluded.item_name;

insert into public.rental_contracts (
  id, contract_number, invoice_id,
  customer_user_id, merchant_id,
  start_date, end_date,
  rental_fee_amount, security_deposit, total_amount,
  status, signed_at, ended_at
)
values (
  '55555555-5555-5555-5555-550000000301',
  'CT-300001',
  '33333333-3333-3333-3333-330000000301',
  '22222222-2222-2222-2222-222222220003',
  '11111111-1111-1111-1111-111111110002',
  current_date - 120, current_date - 90,
  9500, 2000, 10925,
  'ended', now() - interval '120 days', now() - interval '89 days'
)
on conflict (id) do update
  set status = excluded.status,
      ended_at = excluded.ended_at;

insert into public.promissory_notes (
  id, reference_number, contract_id,
  customer_user_id, merchant_id,
  beneficiary_name, principal_amount, due_date,
  status, signed_at, settled_at
)
values (
  '66666666-6666-6666-6666-660000000301',
  'PN-300001',
  '55555555-5555-5555-5555-550000000301',
  '22222222-2222-2222-2222-222222220003',
  '11111111-1111-1111-1111-111111110002',
  'House of Dresses Trading Co.',
  10925, current_date - 60,
  'settled', now() - interval '120 days', now() - interval '89 days'
)
on conflict (id) do update
  set status = excluded.status,
      settled_at = excluded.settled_at;

-- Second ended rental (~6 months ago)
insert into public.rental_invoices (
  id, invoice_number, merchant_id, customer_user_id,
  subtotal_amount, tax_amount, security_deposit, total_amount,
  status, issued_at, expires_at, notes
)
values (
  '33333333-3333-3333-3333-330000000302',
  'INV-300002',
  '11111111-1111-1111-1111-111111110002',
  '22222222-2222-2222-2222-222222220003',
  7200, 1080, 1500, 8280,
  'accepted', now() - interval '210 days', now() - interval '180 days',
  'فستان سهرة كحلي'
)
on conflict (id) do update set status = excluded.status;

insert into public.rental_invoice_items (
  id, invoice_id, position, item_name, category,
  size_label, color, daily_rate, rental_days, subtotal, replacement_value
)
values (
  '44444444-4444-4444-4444-440000000302',
  '33333333-3333-3333-3333-330000000302',
  0, 'فستان سهرة كحلي', 'dress',
  '38', 'كحلي', 240, 30, 7200, 9500
)
on conflict (id) do update set item_name = excluded.item_name;

insert into public.rental_contracts (
  id, contract_number, invoice_id,
  customer_user_id, merchant_id,
  start_date, end_date,
  rental_fee_amount, security_deposit, total_amount,
  status, signed_at, ended_at
)
values (
  '55555555-5555-5555-5555-550000000302',
  'CT-300002',
  '33333333-3333-3333-3333-330000000302',
  '22222222-2222-2222-2222-222222220003',
  '11111111-1111-1111-1111-111111110002',
  current_date - 210, current_date - 180,
  7200, 1500, 8280,
  'ended', now() - interval '210 days', now() - interval '179 days'
)
on conflict (id) do update
  set status = excluded.status,
      ended_at = excluded.ended_at;

insert into public.promissory_notes (
  id, reference_number, contract_id,
  customer_user_id, merchant_id,
  beneficiary_name, principal_amount, due_date,
  status, signed_at, settled_at
)
values (
  '66666666-6666-6666-6666-660000000302',
  'PN-300002',
  '55555555-5555-5555-5555-550000000302',
  '22222222-2222-2222-2222-222222220003',
  '11111111-1111-1111-1111-111111110002',
  'House of Dresses Trading Co.',
  8280, current_date - 150,
  'settled', now() - interval '210 days', now() - interval '179 days'
)
on conflict (id) do update
  set status = excluded.status,
      settled_at = excluded.settled_at;

-- =====================================================================
-- SCENARIO 4 — action required (an issued invoice waiting on accept)
-- =====================================================================

insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222220004',
  'authenticated', 'authenticated',
  'action+customer@lend.test',
  crypt('Lend!2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"مها الحربي"}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do update
  set email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data;

update public.profiles
   set full_name = 'مها الحربي',
       role = 'customer',
       account_status = 'active',
       city = 'الرياض',
       mobile = '0551110004',
       national_id = '1011111104'
 where id = '22222222-2222-2222-2222-222222220004';

insert into public.rental_eligibility (
  user_id, limit_amount, used_amount, tier, assigned_at
)
values (
  '22222222-2222-2222-2222-222222220004',
  40000, 12000, 'standard', now() - interval '60 days'
)
on conflict (user_id) do update
  set limit_amount = excluded.limit_amount,
      used_amount = excluded.used_amount,
      tier = excluded.tier;

-- (a) An issued invoice that's waiting on the customer to accept — this
-- is the actionable item on the dashboard.
insert into public.rental_invoices (
  id, invoice_number, merchant_id, customer_user_id,
  subtotal_amount, tax_amount, security_deposit, total_amount,
  status, issued_at, expires_at, notes
)
values (
  '33333333-3333-3333-3333-330000000401',
  'INV-400001',
  '11111111-1111-1111-1111-111111110002',
  '22222222-2222-2222-2222-222222220004',
  11000, 1650, 2500, 12650,
  'issued', now() - interval '1 day', now() + interval '2 days',
  'فستان زفاف وردي — بانتظار الموافقة'
)
on conflict (id) do update
  set status = excluded.status,
      total_amount = excluded.total_amount,
      issued_at = excluded.issued_at,
      expires_at = excluded.expires_at;

insert into public.rental_invoice_items (
  id, invoice_id, position, item_name, category,
  size_label, color, daily_rate, rental_days, subtotal, replacement_value
)
values (
  '44444444-4444-4444-4444-440000000401',
  '33333333-3333-3333-3333-330000000401',
  0, 'فستان زفاف وردي', 'dress',
  '38', 'وردي', 366.66, 30, 11000, 14000
)
on conflict (id) do update set item_name = excluded.item_name;

-- (b) A prior settled rental — so the screen isn't bare around the
-- actionable invoice and the eligibility "used 12,000" is believable.
insert into public.rental_invoices (
  id, invoice_number, merchant_id, customer_user_id,
  subtotal_amount, tax_amount, security_deposit, total_amount,
  status, issued_at, expires_at, notes
)
values (
  '33333333-3333-3333-3333-330000000402',
  'INV-400002',
  '11111111-1111-1111-1111-111111110002',
  '22222222-2222-2222-2222-222222220004',
  10000, 1500, 2000, 11500,
  'accepted', now() - interval '75 days', now() - interval '45 days',
  'فستان سهرة فحمي'
)
on conflict (id) do update set status = excluded.status;

insert into public.rental_invoice_items (
  id, invoice_id, position, item_name, category,
  size_label, color, daily_rate, rental_days, subtotal, replacement_value
)
values (
  '44444444-4444-4444-4444-440000000402',
  '33333333-3333-3333-3333-330000000402',
  0, 'فستان سهرة فحمي', 'dress',
  '38', 'فحمي', 333.33, 30, 10000, 12500
)
on conflict (id) do update set item_name = excluded.item_name;

insert into public.rental_contracts (
  id, contract_number, invoice_id,
  customer_user_id, merchant_id,
  start_date, end_date,
  rental_fee_amount, security_deposit, total_amount,
  status, signed_at, ended_at
)
values (
  '55555555-5555-5555-5555-550000000402',
  'CT-400002',
  '33333333-3333-3333-3333-330000000402',
  '22222222-2222-2222-2222-222222220004',
  '11111111-1111-1111-1111-111111110002',
  current_date - 75, current_date - 45,
  10000, 2000, 11500,
  'ended', now() - interval '75 days', now() - interval '44 days'
)
on conflict (id) do update
  set status = excluded.status,
      ended_at = excluded.ended_at;

insert into public.promissory_notes (
  id, reference_number, contract_id,
  customer_user_id, merchant_id,
  beneficiary_name, principal_amount, due_date,
  status, signed_at, settled_at
)
values (
  '66666666-6666-6666-6666-660000000402',
  'PN-400002',
  '55555555-5555-5555-5555-550000000402',
  '22222222-2222-2222-2222-222222220004',
  '11111111-1111-1111-1111-111111110002',
  'House of Dresses Trading Co.',
  11500, current_date - 15,
  'settled', now() - interval '75 days', now() - interval '44 days'
)
on conflict (id) do update
  set status = excluded.status,
      settled_at = excluded.settled_at;

commit;

-- ---------------------------------------------------------------------
-- Quick sanity check — run this after the seed and you should see 4
-- customer rows with the right counts. Comment out if you don't need it.
-- ---------------------------------------------------------------------

select
  p.email,
  e.limit_amount,
  e.used_amount,
  (select count(*) from rental_invoices  i where i.customer_user_id = p.id and i.status in ('issued','viewed','accepted')) as invoices_active,
  (select count(*) from rental_contracts c where c.customer_user_id = p.id and c.status = 'active') as contracts_active,
  (select count(*) from promissory_notes n where n.customer_user_id = p.id and n.status in ('pending','signed')) as notes_active,
  (select count(*) from rental_contracts c where c.customer_user_id = p.id and c.status in ('ended','cancelled')) as history_count
from public.profiles p
left join public.rental_eligibility e on e.user_id = p.id
where p.id in (
  '22222222-2222-2222-2222-222222220001',
  '22222222-2222-2222-2222-222222220002',
  '22222222-2222-2222-2222-222222220003',
  '22222222-2222-2222-2222-222222220004'
)
order by p.email;
