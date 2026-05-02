# AppLux MVP — Phase 5: Operational Depth

Phase 5 wires the operational depth around the rental document chain landed in
Phase 4: real merchant login, real reads on the merchant rental detail / contract /
note screens, real contract closure + damage evidence upload, real admin reads
for users and cases, and real customer-name joins on merchant operational lists.

Demo-safe behaviour preserved everywhere — every wire branches on
`useSupabaseAuth().configured`. With env unset, the demo store keeps running
unchanged.

## What landed in Phase 5

### New shared query helpers
- `queries/profile.ts` — added `fetchProfilesByIds(ids[])` (returns a
  `Map<id, ProfileRow>`) and `listProfiles({ role?, limit? })` for admin lists.
- `queries/eligibility.ts` — added `fetchEligibilityByUserIds(ids[])` for
  bulk admin loads.
- `queries/contracts.ts` — added `endRentalContract(id, endedAt?)` for the
  closure path.
- `queries/invoices.ts` — added `fetchInvoiceByContractId(contractId)`.
- `queries/damages.ts` — added `listAllDamageCases({ status?, limit? })`
  (admin select-all via RLS).

### New admin adapters (`src/lib/supabase/adapters.ts`)
- `adaptUserRecord(profile, eligibility?, ctx?)` — maps `profiles` +
  `rental_eligibility` to the existing `AdminUserRecord` UI shape.
- `adaptDamageCase(row, ctx?)` — maps `damage_cases` to `AdminActiveCase`.

### Slice-level wiring

| Goal | Screen(s) | What changed |
|------|-----------|--------------|
| 1 — Merchant login | `MerchantLogin` | When configured, calls `signIn({email, password})`. The provider's `onAuthStateChange` hydrates the role; `RootRedirect` then routes merchants to `/merchant/home`. Demo path (auto-approve + go home) intact. |
| 2 — Rental details / contract / note | `MerchantRentalDetails`, `MerchantRentalContract`, `MerchantRentalNote` | Each fetches `fetchContractById(id)` + `fetchMerchant(...)` + `fetchProfile(customer_user_id)` when configured, then renders via `adaptContractToMerchantRental`. Demo `merchantRentals.find(...)` still wins when present. |
| 3 — Rental closure | `MerchantRentalClose` | Real path calls `endRentalContract(id)` to mark the contract `ended` + `ended_at = now()`. Demo `closeRental(...)` is also called so demo-only sister screens stay in sync. The "report damage" button on the same page already routes to `MerchantDamageNew`, where the real damage case is created. `closeError` / loading states surface in a banner above the submit. |
| 4 — Damage evidence upload | `MerchantDamageNew` | Now keeps `evidenceFiles: File[]` alongside the existing dataURL preview state. After `createDamageCase` succeeds, each file uploads to `damage-evidence` Storage via `uploadDamageEvidence`. Failures are logged but don't unwind the case (best-effort). |
| 5a — Admin users | `AdminUsers`, `AdminUserDetails` | `AdminUsers` lists customer profiles via `listProfiles({role:'customer'})` + bulk `fetchEligibilityByUserIds`. `AdminUserDetails` fetches the single profile + eligibility by id. Both pass through `adaptUserRecord`. |
| 5b — Admin cases | `AdminCases` | List view fetches `listAllDamageCases()` + `fetchProfilesByIds(...)` for customer names; mapped through `adaptDamageCase`. The Overdue tab still reads demo seed (overdue payments aren't modelled in the schema yet — Phase 6). `AdminCaseDetails` is left on demo for this phase (its UI is highly bespoke around demo-only fields like notes/escalation; honest scope deferral to Phase 6). |
| 6 — Real customer names | `MerchantApprovals`, `MerchantRentals`, `MerchantHome.RecentRow` | All three now call `fetchProfilesByIds` after their list loads, so `customerName` / `customerInitials` / `customerCity` / `customerMobile` carry real values instead of `'—'` placeholders. |

## Storage bucket — one-time Supabase dashboard setup

Phase 4 prepared the `uploadDamageEvidence` helper. Phase 5 mounts it in
`MerchantDamageNew`. Before either fires in production, the
`damage-evidence` bucket must exist:

1. **Bucket name:** `damage-evidence` (must match `DAMAGE_EVIDENCE_BUCKET` in
   `src/lib/supabase/queries/damages.ts`).
2. **Public:** `false`. Files are private; admin/merchant access is via signed
   URLs (signed-URL viewer is Phase 6).
3. **Recommended Storage policies (apply via Supabase dashboard SQL editor):**

   ```sql
   -- Merchants can upload evidence to their own case folders.
   create policy "merchants upload damage evidence"
     on storage.objects for insert to authenticated
     with check (
       bucket_id = 'damage-evidence'
       and exists (
         select 1 from public.damage_cases dc
         join public.merchants m on m.id = dc.merchant_id
         where dc.id::text = split_part(name, '/', 1)
           and m.owner_user_id = auth.uid()
       )
     );

   -- Admins can read everything in the bucket.
   create policy "admins read damage evidence"
     on storage.objects for select to authenticated
     using (bucket_id = 'damage-evidence' and public.is_admin());

   -- Merchant owners can read evidence on their own cases.
   create policy "merchants read own damage evidence"
     on storage.objects for select to authenticated
     using (
       bucket_id = 'damage-evidence'
       and exists (
         select 1 from public.damage_cases dc
         join public.merchants m on m.id = dc.merchant_id
         where dc.id::text = split_part(name, '/', 1)
           and m.owner_user_id = auth.uid()
       )
     );

   -- Customer can read evidence attached to their own damage cases.
   create policy "customers read own damage evidence"
     on storage.objects for select to authenticated
     using (
       bucket_id = 'damage-evidence'
       and exists (
         select 1 from public.damage_cases dc
         where dc.id::text = split_part(name, '/', 1)
           and dc.customer_user_id = auth.uid()
       )
     );
   ```

The `uploadDamageEvidence` helper writes objects under
`<case_id>/<random>.<ext>` so the policies can scope by parsing the path's
first segment.

## What is now truly live

When env is set and a real merchant + admin pair exists:

1. Merchant signs in via `MerchantLogin` (`signInWithPassword`) → lands at
   `/merchant/home`.
2. They see real rental contracts (live names, cities, mobiles), real pending
   invoice counts, and the live "+Add piece" CTA from Phase 4.
3. Drilling into a rental hits real contract / merchant / customer data on
   `MerchantRentalDetails`, `…Contract`, `…Note`.
4. Closing a rental flips `rental_contracts.status = 'ended'` server-side.
5. Reporting damage on close path or directly creates a real `damage_cases`
   row + uploads each evidence photo to the `damage-evidence` Storage bucket.
6. Admin opens `AdminUsers` → real profiles + eligibility; `AdminUserDetails`
   shows the real user.
7. Admin opens `AdminCases` (Damage tab) → real damage cases with real
   customer names.

## What still remains in demo / local mode

- **Customer:** Eligibility detail (admin-managed limits page), Stores detail,
  Notifications, Tracking root index, Contracts placeholder list.
- **Merchant:** `MerchantPending`, `MerchantWelcome`, `MerchantDamages` list,
  `MerchantDamageDetails`, `MerchantHistoryPage`. The damage list reads from
  the demo store; the case-create path is real but the list view that follows
  isn't yet wired (Phase 6).
- **Admin:** `AdminHome` KPI numbers, `AdminCaseDetails` (deferred), Overdue
  tab on `AdminCases`, all `/admin/limits|reports|audit|support` placeholders.
- **Auth:** Nafath OTP, `RegisterSuccess`, `AuthEntry`.
- Demo evidence preview (dataURL) is still rendered in
  `MerchantDamageNew`; the Storage upload is parallel and best-effort.

## Build status

`npm run build` clean — `tsc -b && vite build` passes, 171 modules,
917 KB / 228 KB gzipped.

## What Phase 6 should be

Phase 6 closes out the operational gaps and starts the depth work for
production:

1. **`AdminCaseDetails` real wiring** — overlay real `damage_cases` row,
   `damage_evidence` list (with signed URLs for image rendering), and a join
   on `profiles` for customer + raised-by names. Likely needs a small adapter
   to fold the real fields onto the bespoke detail UI.
2. **`MerchantDamages` list + `MerchantDamageDetails`** — list real cases
   for the merchant via `listMerchantDamageCases`; detail reads case +
   evidence with signed URLs.
3. **Signed-URL evidence viewer** — small helper that turns
   `storage_path` rows into time-bound URLs the admin and case-related
   parties can render. Replaces the dataURL preview path in viewers.
4. **Admin Home dashboard KPIs** — replace seed numbers with real counts/sums
   over `merchant_applications`, `profiles`, `rental_contracts`, `damage_cases`.
   Promote the heaviest aggregates to materialized views if hot.
5. **Customer dedicated `Contracts` page** — list active + history rentals
   with their tracking links (Home already shows them; this is the broader
   list).
6. **Merchant onboarding "category picker"** — `MerchantRegister` currently
   defaults `primary_category` to `'dress'`; add the picker so the
   application carries the real value end-to-end.
7. **Realtime channels** — subscribe to `rental_invoices` for the merchant's
   live approvals list and `rental_contracts` for the customer's home.
8. **Merchant operational dashboard polish** — overdue counts derived from
   `promissory_notes` past `due_date`; revenue split by category.
9. **Auth UX polish** — password reset, error message i18n, route-level
   splash while session hydrates.

Phase 7+ (mapped, not planned in detail): Nafath OTP, Nafith attestation,
payments, notifications, audit log.
