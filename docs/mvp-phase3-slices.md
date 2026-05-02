# AppLux MVP — Phase 3 Slices

Phase 3 starts wiring real Supabase data into the app one screen at a time. The
scope is deliberately narrow: six slices, each gated on `useSupabaseAuth().configured`
so demo mode keeps working when env vars are missing.

## What landed in Phase 3

### Slice 1 — Auth screens + role-aware route gating
- `src/components/auth/RequireRole.tsx` — single guard component:
  - **demo mode** (`!configured`) — falls back to the legacy `useStore().session` flag for customer routes; merchant/admin routes pass through (preserving pre-Phase-3 demo navigation).
  - **real mode** — gates on `useSupabaseAuth().status === 'authenticated'` and the Supabase `profile.role`.
- `src/routes.tsx` — every merchant route wrapped in `RequireRole role="merchant"`, every admin route wrapped in `RequireRole role="admin"`. Customer area uses `RequireRole role={['customer','admin']}`.
- `RootRedirect` is now role-aware in real mode (`merchant → /merchant/home`, `admin → /admin/home`, otherwise `/home`).
- `src/pages/auth/Login.tsx` — when `configured`, swaps the mobile field for an email field and calls `signInWithPassword`. Demo mode (mobile + delayed nav) unchanged.
- `src/pages/auth/Register.tsx` — when `configured`, renders a minimal full-name + email + password sign-up that calls `signUpWithPassword`. The 3-step demo flow stays intact when env is missing.
- New i18n keys in both `ar.json` and `en.json`: `auth.email`, `auth.emailPh`, `auth.errors.{emailRequired,emailFormat,fullNameRequired,signInFailed,signUpFailed}`.

### Slice 2 — Home eligibility card
- `src/pages/Home.tsx` reads from `useSupabaseAuth().eligibility` when configured + present, falling back to the demo `useStore().eligibility` otherwise.
- Greeting now reads from `useSupabaseAuth().profile.full_name` (real) or the demo `session.fullName`.
- `usagePct` guarded against zero limits (real users start with `limit_amount = 0` until admin assigns one).

### Slice 3 — Partner Boutiques list
- `src/pages/Stores.tsx` switches its data source via a `useEffect`:
  - if `!configured` → demo `useStore().stores`
  - if `configured` → `listMerchants()` mapped through `adaptMerchantToStore`
  - on fetch error → falls back to demo seed (logs to console)
- The existing `StoreCard` UI is unchanged; the adapter maps `MerchantRow → PartnerStore` (singular DB category → plural UI category, single-row primary branch placeholder).

### Slice 4 — Merchant onboarding
- `src/pages/merchant/MerchantRegister.tsx` — on the final submit:
  - if `configured` and the user is authenticated → `submitMerchantApplication(...)` then continue to demo "submitted" UX
  - if `configured` and not authenticated → redirects to `/auth/login`
  - if `!configured` → demo `submitMerchantApproval()` only
- Surfaces `submitError` as a soft danger banner above the submit button; `submitting` flag drives the button's loading state.
- Demo form doesn't yet carry a `category` field; the real submission defaults `primary_category` to `'dress'` for now (admin can re-categorize on approval; Phase 4 will add a category picker).

### Slice 5 — Admin merchant approval
- `src/pages/admin/AdminMerchants.tsx` — list view fetches from `listMerchantApplications()` when configured, mapped through `adaptMerchantApplication`. Falls back to demo seed on error.
- `src/pages/admin/AdminMerchantDetails.tsx` — when configured:
  - fetches the single application via `fetchMerchantApplication(id)` and adapts it.
  - Approve / Reject buttons call `decideMerchantApplication(id, 'approved' | 'rejected', notes)`. The returned row is re-adapted into local state so the UI updates without a refetch.
  - Reset (`resetMerchantRequest`) is a demo-only convenience; it's a no-op when configured.
- Surfaces a `decisionError` banner above the action buttons.

### Slice 6 — Profile screen
- `src/pages/Profile.tsx` reads `fullName` / `email` / `nafathVerified` from `useSupabaseAuth().profile` (real) or `useStore().session` (demo) via three small ternaries.
- Sign-out calls `supabaseSignOut()` when configured, otherwise `demoSignOut()`. Both navigate to `/welcome`.

### Adapter layer
- `src/lib/supabase/adapters.ts`:
  - `adaptEligibility(RentalEligibilityRow) → RentalEligibility`
  - `adaptMerchantToStore(MerchantRow) → PartnerStore`
  - `adaptMerchantApplication(MerchantApplicationRow) → AdminMerchantRequest`
- All three are pure functions with no React dependencies; testable in isolation.

## What still runs on demo / local mode

These screens still read from the localStorage-backed demo store. They will be ported in later phases:

- **Customer:** Eligibility detail page, Stores detail, Contracts list, Notifications, Scan / Review / Approval / Tracking, Invoice / Contract / Note tracking pages.
- **Merchant:** Home dashboard, Rentals list + detail, Rental contract / note / close flow, Approvals, Damages list + detail + new, History, Invoice creation.
- **Admin:** Home dashboard KPIs, Users list + detail, Cases list + detail, Module placeholders.
- **Auth:** Nafath OTP screen, RegisterSuccess screen, AuthEntry chooser, MerchantWelcome, MerchantLogin (still demo-only — Phase 4 wires merchant login).

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset:
- `supabaseConfigured === false`
- `useSupabaseAuth().status === 'disabled'`
- All six slices fall back to the demo store with no behavior change vs. Phase 2.

## Build status

`npm run build` clean — `tsc -b && vite build` passes, 167 modules, 893 KB / 221 KB gzipped (Supabase client is the size). No new ESLint warnings beyond pre-existing ones.

## What Phase 4 should be

Phase 4 wires the **rental document chain** — the heart of the product — and lights up the merchant operational dashboard:

1. **Merchant invoice creation flow** (`MerchantInvoiceNew`) writes `rental_invoices` + `rental_invoice_items` and returns a `scan_token`. Token surfaces as a QR code on screen.
2. **Customer scan + review + accept flow** (`Scan` → `Review` → `Approval`) resolves the `scan_token` to the live invoice, lets the customer accept, and on accept writes a `rental_contracts` row + `promissory_notes` row + bumps `rental_eligibility.used_amount`.
3. **Document tracking pages** (`InvoiceTracking`, `ContractTracking`, `NoteTracking`) read from the real tables, falling back to demo when env missing.
4. **Customer "My Contracts" list + Home active rentals row** read live `rental_contracts` for the user.
5. **Merchant Home dashboard KPIs** read counts/sums from `rental_contracts` + `rental_invoices` for the merchant id.
6. **Merchant approvals list** reads pending `rental_invoices` (status `issued`) for the merchant.
7. **Damage flow** (`MerchantDamageNew`, `MerchantRentalClose`) writes `damage_cases` + uploads `damage_evidence` to a Supabase Storage bucket (`damage-evidence`).
8. **Admin overview**: Users list reads `profiles` filtered by role; admin can adjust `rental_eligibility` via a small RPC or direct update; Cases list reads `damage_cases`.
9. **Merchant provisioning RPC** — when admin approves a `merchant_applications` row, an Edge Function (or `security definer` Postgres function) creates the matching `merchants` row and lifts `profiles.role` to `'merchant'`. Currently the decision update only flips the application's status; the actual role lift / merchant row creation is the missing link before the merchant area becomes usable for real users.

Phase 5+ (mapped, not planned in detail): Realtime subscriptions for live invoice/approval lists, Storage signed-URL upload UX for damage evidence, computed views for merchant + admin dashboards, password recovery / OTP, route-level auth splash while session is hydrating.
