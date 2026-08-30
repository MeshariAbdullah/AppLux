# Lend — Full System Manual Test (Merchant Design D1–D5 Integration)

Complete end-to-end manual pass against the **Vercel production
deployment** of the integrated merchant design implementation.

- **Production branch:** `claude/setup-i18n-rtl-support-soMKY`
- **Integrated commit:** `1b927b3` (D1 `20b82bf` · D2 `8f8d3e8` · M01 fix
  `23699b7` · D3 `81eb8d4` · D4 `c64ee9c` · D5 `1b927b3`)
- **Rollback:** Vercel → Deployments → previous production deployment →
  *Promote to Production*. Code rollback point (pre-design):
  `f594d25`. Pre-integration production HEAD: `1b927b3`.
- Confirm the deployed release line on `/merchant/profile` (or
  `/diagnostics`) shows the commit you expect before starting.

**Test data rules:** use throwaway test emails you control, test
mobile numbers in the valid Saudi format (9 digits starting with 5),
and synthetic National IDs (10 digits starting with 1 or 2). Never use
real personal information. Do not reuse a CR number that already has a
pending application.

Fill **Pass/Fail** and **Notes** per row. Stop and capture the support
ID (LND-XXXXXXXX) plus a screenshot for any technical error.

---

## 1. New customer

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Customer | Signed out, `/welcome` | Open the app root | Customer welcome renders (Arabic RTL), no demo data visible anywhere | | |
| 1.2 | Customer | `/auth/register` | Register with full name, mobile (5xxxxxxxx), email + password | Account created; email-confirmation panel or direct sign-in per project email settings. **NO National ID field anywhere in signup** | | |
| 1.3 | Customer | Registration form | Inspect every signup step | No National ID (or last-4) input exists; account is created without it | | |
| 1.4 | Customer | Registered account | Sign in at `/auth/login` | Lands on customer home; role is customer | | |
| 1.5 | Customer | Signed in | Open the profile page | Name/mobile shown; **no National ID row** (it is contract data, not profile data) | | |
| 1.6 | Admin | Admin console → users | Locate the new customer, assign an eligibility limit (e.g. 5,000) | Eligibility saved; customer sees no admin internals | | |

## 2. New merchant application

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Merchant | Signed out, `/merchant/welcome` | Open merchant welcome | M01 layout: centered logo+copy on navy, beige action sheet; compact language toggle | | |
| 2.2 | Merchant | `/merchant/register` | Walk step 1/5 with a NEW email + password | LTR «1 / 5» counter, 5-segment bar; mismatched passwords blocked | | |
| 2.3 | Merchant | Step 2/5 | Company name + 10-digit CR; try continuing WITHOUT a category | Category chip grid required error; selecting a chip clears it | | |
| 2.4 | Merchant | Step 3/5 | Representative name, National ID, contact mobile | Format validation on ID (10 digits, 1/2) and mobile (5xxxxxxxx) | | |
| 2.5 | Merchant | Step 4/5 | Add a second branch, fill both, remove one; try an empty branch | Add/edit/remove work; ≥1 complete branch enforced | | |
| 2.6 | Merchant | Step 5/5 review | Check the representative National ID display | Masked (first 2 + last 2 digits only) | | |
| 2.7 | Merchant | Step 5/5 | Submit | ONE signup; lands on `/merchant/pending` (or email-confirm panel first); application visible with short reference | | |
| 2.8 | Merchant | While pending | Try `/merchant/home` and `/merchant/session/new` directly | Bounced to `/merchant/pending` every time | | |
| 2.9 | Merchant | Signed in as the CUSTOMER from §1 | Open `/merchant/register` | Sign-out interstitial — a customer session can never fill the merchant wizard | | |

## 3. Admin merchant approval

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 3.1 | Admin | Admin console → merchant applications | Open the §2 application | All submitted fields + branches visible | | |
| 3.2 | Admin | Application open | Reject it with an internal decision note | Status rejected; note saved | | |
| 3.3 | Merchant | Rejected applicant signs in | View `/merchant/pending` | Red state, **neutral** copy only — the admin's internal note is NEVER shown | | |
| 3.4 | Admin | Second test application (repeat §2 quickly) | Approve it | Merchant + branches provisioned; application approved | | |
| 3.5 | Merchant | Approved merchant on `/merchant/pending` | Tap «تحديث الحالة» / continue | Routed forward to `/merchant/home` without re-login | | |

## 4. Approved merchant login

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 4.1 | Merchant | Signed out | Sign in at `/merchant/login` | Lands on the M09 dashboard | | |
| 4.2 | Customer | Customer credentials on `/merchant/login` | Sign in | Signed out with the wrong-account-type notice + customer-portal link | | |
| 4.3 | Merchant | Dashboard | Review the four stat tiles | Counts match reality: active rentals, awaiting review, returns this week, open damage | | |
| 4.4 | Merchant | Dashboard | Review «يحتاج انتباهك» | Only real actionable rows (overdue / awaiting review / due soon), real references | | |
| 4.5 | Merchant | Dashboard | Check for sign-out/version here | Absent — both live on `/merchant/profile` only | | |

## 5. Merchant creates rental offer

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 5.1 | Merchant | Dashboard | Tap «إصدار عقد إيجار جديد» | Focused 5-step session opens; bottom nav hidden; «1 / 5» | | |
| 5.2 | Merchant | Verify step | Look up the §1 customer's mobile | Existence only — customer NAME NOT shown; NO last-4-of-ID prompt anywhere | | |
| 5.3 | Merchant | Lookup done | Send the verification code, then enter a WRONG code | «الرمز غير صحيح»; still no name revealed | | |
| 5.3b | Customer | Signed in on their own device | Open the Lend Home screen | The random one-time code card appears (code + boutique name + expiry); it is NOT visible to any other account | | |
| 5.4 | Merchant | Lookup done | Enter the code the customer reads from their app | Customer name revealed only now | | |
| 5.4b | Merchant (API) | Verified session skipped | Attempt to insert a rental_invoices row directly via the REST API without a verified code | Rejected server-side with P0195 — issuance is impossible without OTP | | |
| 5.5 | Merchant | Operation step | Item description, days, daily rate, ORIGINAL item value above the eligibility limit | Eligibility check returns insufficient; reduce-value path offered | | |
| 5.6 | Merchant | Operation step | Set a value within the limit and continue | «العميل مؤهَّل» (live read each time) | | |
| 5.7 | Merchant | Contract step | Try to issue WITHOUT the customer National ID | Issue CTA disabled until a valid 10-digit ID (1/2 prefix) is entered | | |
| 5.7b | Merchant | Contract step | Enter the customer's full National ID, review adjustable clauses, issue the package | ONE issuance; M11 success: green check, REAL invoice reference, «المرحلة 2 من 4 · مراجعة العميل» | | |
| 5.8 | Merchant | Success screen | Verify absence of payment/note/Nafath/Nafith wording | None anywhere | | |
| 5.9 | Merchant | Success screen | Tap «متابعة الإيجارات» | Rentals list opens pre-filtered to «مراجعة العميل» with the new offer | | |

## 6. Customer reviews and accepts

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 6.1 | Customer | Signed in | Open the offer (notification / review link) | Offer + contract terms visible; the contract step shows the National ID exactly as the merchant recorded it for THIS contract | | |
| 6.2 | Customer | Review screen | Verify absence of payment/note/Nafath UI | No payment button, no note signing, no Nafath step | | |
| 6.3 | Customer | Review screen | Accept the offer | Rental activates immediately (no-payment path); journey moves to «بدء الإيجار» | | |
| 6.4 | Customer | After accept | Check customer rentals/tracking | Active rental with correct dates and amounts | | |

## 7. Merchant verifies activation

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 7.1 | Merchant | Rentals list | Refresh/reopen after §6 | Offer left «مراجعة العميل»; contract now under «نشط» with real contract ref | | |
| 7.2 | Merchant | Rental details | Open the new contract | M13: journey stepper stage 3 current, customer card, facts card (fee + ORIGINAL value), contract document link | | |
| 7.3 | Merchant | Dashboard | Revisit tiles | Active count incremented; awaiting-review decremented — no manual reload needed | | |

## 8. Merchant closes rental

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 8.1 | Merchant | Active rental details | Tap close | M14: receipt-confirmation checkbox FIRST; submit disabled until checked | | |
| 8.2 | Merchant | Close form | Verify NO item-condition selector and NO photo controls | Absent (deferred — unsupported by the close RPC) | | |
| 8.3 | Merchant | Checked | Submit → confirmation sheet → confirm | ONE close; centered green success with the contract reference | | |
| 8.4 | Merchant | After close | Rentals list + details | Row shows «مُرجَع»; details show finalized banner; close/damage actions gone | | |
| 8.5 | Customer | After close | Customer view of the rental | Journey stage 4 complete; eligibility hold released (check available limit) | | |

## 9. Damage / non-return scenario (separate rental)

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 9.1 | Merchant + Customer | Repeat §5–§6 for a SECOND rental | — | Second active contract exists | | |
| 9.2 | Merchant | Active rental details | Tap report damage | M15: red warning banner first; three issue types | | |
| 9.3 | Merchant | Damage form | Pick «ضرر جزئي» | Claim autofills 30% of the ORIGINAL item value | | |
| 9.4 | Merchant | Damage form | Enter a claim above the item's original value | Blocked with the cap error | | |
| 9.5 | Merchant | Damage form | Valid claim + description + 1–2 evidence photos → submit → confirm | ONE case created; navigates to the case; contract finalized as damaged | | |
| 9.6 | Merchant | After case | Rental details | Damaged outcome banner + case link; close/damage actions gone | | |
| 9.7 | Admin | Admin cases | Open the new damage case | Case visible with claim + evidence | | |

## 10. Permissions and negative cases

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 10.1 | Customer | Signed in | Direct-open `/merchant/home`, `/merchant/rentals`, `/merchant/session/new` | All redirect away — no merchant data ever renders | | |
| 10.2 | Merchant | Signed in | Direct-open `/admin/home` | Redirected away | | |
| 10.3 | Rejected merchant | §3.3 account | Direct-open `/merchant/home` | Bounced to the application-status page | | |
| 10.4 | Any user | Browser devtools | Attempt a direct PATCH of own `profiles.role` / `account_status` via the REST endpoint | Server refuses (P0100 guard) — role unchanged after reload | | |
| 10.5 | Merchant | Finalized rental from §8/§9 | Direct-open `/merchant/rentals/:id/close` and `/damage/new` | Close shows the already-closed state; damage redirects to details | | |
| 10.6 | Merchant | Session verify step | Look up a mobile with no account | «العميل غير مسجَّل» — nothing about any other user leaks | | |
| 10.7 | Merchant | Session verify step | Confirm with wrong last-4 THEN abandon the session | Name never appeared; nothing cached (reopen session → lookup starts clean) | | |

## 11. Arabic/English and mobile layout

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 11.1 | Any | iPhone-size viewport 390×844, Arabic | Sweep welcome, register, pending, dashboard, rentals, details, session, profile | RTL correct; no horizontal scroll on any screen | | |
| 11.2 | Any | 390×667 (small phone) | Same sweep | Nothing clipped; primary actions reachable; safe areas respected | | |
| 11.3 | Any | Language toggle → English | Same sweep | Full LTR mirror; translated labels; numbers/references stay LTR | | |
| 11.4 | Merchant | Dashboard/rentals/profile | Check the bottom tab bar | 4 tabs (الرئيسية/الإيجارات/إصدار/حسابي); never covers content or actions | | |
| 11.5 | Merchant | Issue session + register wizard | Check the tab bar | Hidden in focused flows | | |
| 11.6 | Any | Slow network (throttle) | Reload dashboard + rentals | Skeletons (no zero-flash, no demo-data flash); empty states only when truly empty | | |
| 11.7 | Any | Airplane mode mid-session | Toggle offline | Offline banner appears; recovers on reconnect | | |

## 12. Diagnostics and support IDs

| # | Actor | Starting condition | Action | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 12.1 | Merchant | `/merchant/profile` | Tap the release line 7 times | `/diagnostics` opens; release line shows version · deployed commit · production | | |
| 12.2 | Any | `/diagnostics` | Copy the diagnostic report | Report contains release/role/session/cache lines; NO personal data, tokens, or storage dump | | |
| 12.3 | Merchant | Force a technical error (e.g. close a rental while offline) | Submit | Translated error + LND-XXXXXXXX support ID; retry works after reconnect | | |
| 12.4 | Tester | Old tab from the PREVIOUS deployment | Navigate after the new deploy | Chunk-reload guard recovers the tab (no white screen) | | |

---

## Appendix A — production environment variables (names only)

Required in the Vercel **Production** environment:

| Variable | Requirement |
|---|---|
| `VITE_SUPABASE_URL` | present (build-time) |
| `VITE_SUPABASE_ANON_KEY` | present (build-time) |
| `VITE_DEMO_MODE` | **absent** (or not `true`) — demo must stay off |
| `VITE_PRIVACY_POLICY_URL` | present (consent + App Store row) |
| `VITE_SUPPORT_URL` / `VITE_SUPPORT_EMAIL` | present (support row) |
| `VITE_TERMS_URL` | if absent, the registration consent section stays hidden by design |
| `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` | injected by Vercel automatically (release line) |

Payments/promissory note/Nafath/Nafith are disabled by the compile-time
constant `ENABLE_PAYMENTS_AND_NOTES = false` — no env variable involved.

## Appendix B — read-only live database compatibility check

Paste in the Supabase SQL editor (SELECTs only — changes nothing):

```sql
select 'lookup_renter_by_mobile 2-col' as check,
       (select count(*) from information_schema.parameters
         where specific_schema='public'
           and specific_name like 'lookup_renter_by_mobile%'
           and parameter_mode='OUT') = 2 as ok
union all
select 'merchant_start_renter_otp', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='merchant_start_renter_otp')
union all
select 'merchant_verify_renter_otp', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='merchant_verify_renter_otp')
union all
select 'get_renter_eligibility', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_renter_eligibility')

union all
select 'activate_rental_without_payment_and_note', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='activate_rental_without_payment_and_note')
union all
select 'close_rental_contract', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='close_rental_contract')
union all
select 'approve_merchant_application', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='approve_merchant_application')
union all
select 'signup trigger v3 (stash strip)', exists
  (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='handle_new_auth_user')
union all
select 'merchant_application_branches table', exists
  (select 1 from information_schema.tables
    where table_schema='public' and table_name='merchant_application_branches')
union all
select 'merchant_branches table', exists
  (select 1 from information_schema.tables
    where table_schema='public' and table_name='merchant_branches')
union all
select 'P0100 role/status guard trigger', exists
  (select 1 from pg_trigger where tgname='trg_guard_profile_role_status')
union all
select 'damage_cases table', exists
  (select 1 from information_schema.tables
    where table_schema='public' and table_name='damage_cases');
```

Every row must return `ok = true`. If any row is false, do NOT proceed —
the responsible migrations are `20260502122300`–`20260502122800` (plus
`20260502122400` for activation); report before applying anything.
