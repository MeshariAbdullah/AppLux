# AppLux MVP — Phase 4: Rental Document Chain

Phase 4 wires the heart of the product: the **invoice → contract → promissory
note** chain, plus the merchant operational dashboard and the foundation of the
damage flow. Every screen retains demo-safe behaviour when env is missing.

## What landed in Phase 4

### New migration — `20260502120300_phase4_rpcs.sql`
Two `SECURITY DEFINER` functions wrap multi-step writes the client cannot do
under default RLS:

- `accept_rental_invoice(p_invoice_id uuid)` — customer-callable. Validates the
  caller owns the invoice and it's in `issued`/`viewed` state, then:
  1. creates a `rental_contracts` row (30-day default period)
  2. creates a `promissory_notes` row (60-day due date, signed)
  3. flips invoice status to `accepted`
  4. bumps `rental_eligibility.used_amount` (best-effort)
  Returns the new contract id.

- `provision_merchant_from_application(p_application_id uuid)` —
  admin-callable. Validates the application is approved, then:
  1. creates the `merchants` row (idempotent — returns existing if already done)
  2. lifts `profiles.role` to `'merchant'` for the applicant
  Returns the merchant id.

### Extended data layer
- `src/lib/supabase/types.ts` — added `RentalInvoiceRow`/`Insert`/`Update`,
  `RentalInvoiceItemRow`/`Insert`/`Update`, `RentalContractRow`/`Insert`/`Update`,
  `PromissoryNoteRow`/`Insert`/`Update`, `DamageCaseRow`/`Insert`/`Update`,
  `DamageEvidenceRow`/`Insert`. Database type also declares the four
  document-number generators + the two RPCs as `Functions`.
- `src/lib/supabase/queries/invoices.ts` — `createInvoiceWithItems`,
  `fetchInvoiceById`, `fetchInvoiceByToken`, `listInvoiceItems`,
  `listCustomerInvoices`, `listMerchantInvoices`, `acceptRentalInvoice`.
- `src/lib/supabase/queries/contracts.ts` — `fetchContractById`,
  `listCustomerContracts`, `listMerchantContracts`.
- `src/lib/supabase/queries/notes.ts` — `fetchNoteById`, `fetchNoteByContractId`,
  `listCustomerNotes`.
- `src/lib/supabase/queries/damages.ts` — `createDamageCase`, `fetchDamageCase`,
  `listMerchantDamageCases`, `listCaseEvidence`, `uploadDamageEvidence` (Storage
  helper, ready to mount when Phase 5 adds the upload UX).
- `src/lib/supabase/queries/merchant-applications.ts` —
  `provisionMerchantFromApplication` RPC wrapper.
- `src/lib/supabase/adapters.ts` — `adaptInvoice`, `adaptContract`, `adaptNote`,
  `adaptContractToHistory`, `adaptContractToMerchantRental`, and
  `synthesizePackageFromInvoice` (real invoice + items → `ScannedPackage` so the
  Review/Approval UIs render unchanged against live data).

### Slice-level wiring

| Goal | Screen(s) | What changed |
|------|-----------|--------------|
| 1 — Invoice creation | `MerchantInvoiceNew` | When configured + authenticated, the submit handler fetches `fetchMyMerchant`, looks up the customer profile by email, runs `createInvoiceWithItems`, and surfaces the returned `scan_token` as the QR. Falls back to demo issuance with a warning banner if anything fails. |
| 2 — Scan + accept | `Review`, `Approval` | Both pages now resolve the URL token via `fetchInvoiceByToken`. When found, they render the existing rich UI by synthesising a `ScannedPackage` from the real invoice + items + merchant. The customer's "Approve" call goes through the `acceptRentalInvoice` RPC, which atomically creates contract + note and bumps eligibility. |
| 3 — Tracking pages | `InvoiceTracking`, `ContractTracking`, `NoteTracking` | Each fetches its row by id from the real tables, plus joins (invoice's contract, contract's invoice + note, note's contract) when configured. Falls back to demo lookup when env missing. |
| 4 — Customer rentals visibility | `Home` | The four sections (Active invoices, Active contracts, Active notes, History) now overlay live `listCustomer*` results when configured + authenticated. The dedicated `Contracts` placeholder page is unchanged (still empty-state). |
| 5 — Merchant dashboard | `MerchantHome`, `MerchantRentals` | Both fetch the caller's merchant via `fetchMyMerchant`, then `listMerchantContracts` for live rentals. `MerchantHome.pendingCount` reads `listMerchantInvoices(..., {status:'issued'}).length` when configured. |
| 6 — Merchant approvals | `MerchantApprovals` | List swaps to `listMerchantInvoices(..., {status:'issued'})` mapped through a tiny in-file `invoiceRowToApproval` adapter. Customer name/initials are placeholders until Phase 5 joins profile data. |
| 7 — Damage foundation | `MerchantDamageNew` | Final report calls `createDamageCase` with the contract row (looked up via `fetchContractById(rental.id)`), capturing severity, claim amount, description, and `raised_by_user_id`. Falls back to demo `reportDamage` if anything fails. Storage upload helper (`uploadDamageEvidence`, bucket name `damage-evidence`) is exported and ready for Phase 5 UX wiring. |
| 8 — Merchant provisioning | `AdminMerchantDetails` | After a successful `decideMerchantApplication('approved')`, the screen calls `provisionMerchantFromApplication(id)` to create the `merchants` row and lift `profiles.role`. Idempotent server-side. Errors surface in the existing `decisionError` banner so a partial state is visible. |

### Demo-safe behaviour
Every wired screen still branches on `useSupabaseAuth().configured`. With env
unset, none of the new code paths fire — the localStorage demo store keeps
running exactly as before.

## What is now truly live

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set and a real
`merchants` row exists for a logged-in merchant, the following round-trip works
end-to-end against Postgres:

1. **Merchant** signs in, fills `MerchantInvoiceNew` with an existing customer's
   email → `rental_invoices` + `rental_invoice_items` are inserted; QR shows the
   real `scan_token`.
2. **Customer** signs in on another device, scans the QR (or pastes the token
   into `/review/<token>`) → live invoice resolves and renders.
3. Customer accepts at the confirm step → `accept_rental_invoice` RPC creates
   `rental_contracts` + `promissory_notes`, marks the invoice `accepted`, bumps
   `rental_eligibility.used_amount`.
4. Customer's Home now shows the new contract + note in the active sections.
   Each has a tracking page reading from the real tables.
5. **Merchant**'s Home dashboard shows the new rental in the "active" KPI and
   `MerchantRentals` lists it. Approvals list shrinks by one.
6. Merchant on rental close path can run `MerchantDamageNew` → real
   `damage_cases` row created.
7. **Admin** approves a `merchant_applications` row → `merchants` row appears
   and the applicant's `profiles.role` lifts to `merchant`. They can sign in and
   land on `/merchant/home`.

## What still runs on demo / local mode

- **Customer:** Eligibility detail page, Stores detail page, Notifications,
  Scan animation (just a timer; the token-based real flow still works via
  `/review/:token`), Tracking root page, Contracts placeholder page.
- **Merchant:** MerchantRentalDetails, MerchantRentalContract,
  MerchantRentalNote, MerchantRentalClose closure logic, MerchantDamages list,
  MerchantDamageDetails, MerchantHistoryPage, MerchantPending,
  MerchantWelcome / MerchantLogin (still demo-only — Phase 5 wires merchant
  login).
- **Admin:** Home dashboard KPI numbers, Users list + detail, Cases list +
  detail, all `/admin/*` placeholders.
- **Auth:** Nafath OTP screen, RegisterSuccess, AuthEntry chooser.
- Customer name/initials in `MerchantApprovals` placeholders (need a profile
  join — Phase 5).
- Damage evidence upload UI (only the case row is wired; `uploadDamageEvidence`
  helper exists but isn't mounted).

When env is missing (`supabaseConfigured === false`), every Phase 4 wire
short-circuits and falls back to the demo store — no behaviour change.

## Build status

`npm run build` clean — `tsc -b && vite build` passes, 171 modules,
908 KB / 226 KB gzipped. Bundle growth vs. Phase 3 is the new query helpers
+ adapters (≈15 KB).

## What Phase 5 should be

Phase 5 lights up the operational depth around the chain:

1. **Real merchant login** — `MerchantLogin` calls `signInWithPassword`; on
   sign-in, `RootRedirect` already routes by role.
2. **Customer profile join in MerchantApprovals + MerchantRentals** — fetch
   profiles for the customer ids on the page so names + initials are real.
3. **MerchantRentalDetails / MerchantRentalContract / MerchantRentalNote** —
   read real contract + note rows by id; use existing tracking adapters.
4. **MerchantRentalClose** — when configured, marks the contract `ended` and
   runs the optional damage path through `createDamageCase`.
5. **Damage evidence upload UI** — wire `uploadDamageEvidence` into
   `MerchantDamageNew` and `MerchantRentalClose`. Requires creating the
   `damage-evidence` Storage bucket with merchant-write / admin-read policies in
   the Supabase dashboard.
6. **Admin Users + Cases real reads** — `profiles` filtered by role,
   `damage_cases` listing, eligibility adjustment via small client update
   (admin RLS already permits) or new RPC for atomic limit changes.
7. **Realtime channels** — subscribe to `rental_invoices` for the merchant's
   live approvals list and `rental_contracts` for the customer's home.
8. **Computed views or RPCs for dashboard KPIs** — admin/merchant counts +
   sums move out of the client.
9. **Soft polish around the chain**: token expiry checks, invoice
   `viewed` status flip on review, history tab on customer Profile.

Phase 6+ (mapped, not yet planned): Nafath OTP, Nafith attestation, payments,
notifications, signed-URL evidence viewer, audit log.
