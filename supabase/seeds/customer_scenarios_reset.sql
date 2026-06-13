-- =====================================================================
-- Lend — customer dashboard test scenarios — RESET
-- =====================================================================
-- Wipes the four seeded customer accounts and every row that depends on
-- them. The seeded merchant is removed too, since these scenarios are
-- the only thing that references it. Safe to run repeatedly.
--
-- Targets ONLY the fixed UUIDs from customer_scenarios.sql — no
-- production data is touched.
-- =====================================================================

begin;

-- Children first, in dependency order.

delete from public.promissory_notes
 where customer_user_id in (
   '22222222-2222-2222-2222-222222220001',
   '22222222-2222-2222-2222-222222220002',
   '22222222-2222-2222-2222-222222220003',
   '22222222-2222-2222-2222-222222220004'
 );

delete from public.rental_contracts
 where customer_user_id in (
   '22222222-2222-2222-2222-222222220001',
   '22222222-2222-2222-2222-222222220002',
   '22222222-2222-2222-2222-222222220003',
   '22222222-2222-2222-2222-222222220004'
 );

delete from public.rental_invoice_items
 where invoice_id in (
   select id from public.rental_invoices
    where customer_user_id in (
      '22222222-2222-2222-2222-222222220001',
      '22222222-2222-2222-2222-222222220002',
      '22222222-2222-2222-2222-222222220003',
      '22222222-2222-2222-2222-222222220004'
    )
 );

delete from public.rental_invoices
 where customer_user_id in (
   '22222222-2222-2222-2222-222222220001',
   '22222222-2222-2222-2222-222222220002',
   '22222222-2222-2222-2222-222222220003',
   '22222222-2222-2222-2222-222222220004'
 );

delete from public.rental_eligibility
 where user_id in (
   '22222222-2222-2222-2222-222222220001',
   '22222222-2222-2222-2222-222222220002',
   '22222222-2222-2222-2222-222222220003',
   '22222222-2222-2222-2222-222222220004',
   '11111111-1111-1111-1111-111111110001'
 );

-- Merchant — only referenced by the seeded rentals above.
delete from public.merchants
 where id = '11111111-1111-1111-1111-111111110002';

-- Profiles cascade from auth.users.
delete from auth.users
 where id in (
   '11111111-1111-1111-1111-111111110001',
   '22222222-2222-2222-2222-222222220001',
   '22222222-2222-2222-2222-222222220002',
   '22222222-2222-2222-2222-222222220003',
   '22222222-2222-2222-2222-222222220004'
 );

commit;
