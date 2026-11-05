# Package 2 — D-1 / D-2 Technical Proposal (for approval; nothing applied)

Scope: LEND Web Staging only (lend-test `hdwqavrwjwfgtdyjemfz`, Vercel
`lend-staging`, branch `claude/staging-supabase-separation`). No migration
applied, no deploy, no hosted state changed by this document.

---

## D-1 — Dispute resolution must not end the rental or release eligibility

### Approved principle (Product Owner)
A terminal damage/dispute outcome never, by itself, implies the asset was
returned, lost, or that the contract should end. Contract closure happens only
through an explicit asset-lifecycle action: verified return (Package 1 return
workflow), confirmed non-handover (Package 1 mutual confirmation), or a future,
separately authorized write-off procedure. Eligibility stays committed until a
legitimate closure transition completes. Financial resolution and asset
lifecycle are separate state machines.

### Verified current mechanism (code + live-equivalent replica at 130600)
* Every terminal dispute path funnels into one internal function,
  `resolve_dispute_case(case, outcome, agreed_amount, actor, party)`
  (20260502124700), which touches ONLY `damage_cases`, `dispute_events`
  and `notifications`:
  | Path (latest definition) | Outcome | Terminal status |
  |---|---|---|
  | `customer_accept_claim` (125400) | `claim_accepted` | settled |
  | `respond_to_settlement_proposal` accept (125900) | `direct_settlement` | settled |
  | `respond_to_lend_proposal` both accept (125900) | `lend_settlement` | settled |
  | `respond_to_lend_proposal` any reject (125900) | `unresolved` | unresolved |
  | `admin_dismiss_dispute_case` (124900/130000) | `dismissed` | dismissed |
  | `record_customer_no_response` (125400) | — (→ `lend_mediation`) | not terminal |
* The contract side-effect lives in ONE place: trigger
  `trg_on_damage_case_resolved` — `AFTER UPDATE OF status ON damage_cases`
  → `on_damage_case_resolved()` (124700 lines 383-435). When status goes
  open/escalated → settled|unresolved it (a) sets the still-active contract
  to `ended`, (b) subtracts `original_item_value` from
  `rental_eligibility.used_amount`, (c) syncs `dispute_phase = 'resolved'`
  for out-of-band flips. For `dismissed` it only does (c).
* Authoritative check on the replica (`pg_proc` source scan): the only live
  functions that end contracts or decrement eligibility are
  `finalize_contract_closure` (Package 1) and `on_damage_case_resolved`.
  `on_damage_case_inserted` no longer ends contracts (since 124500).
* Package 1's `finalize_contract_closure` / `close_rental_contract` block only
  on `open`/`escalated` cases, so a contract with a settled/unresolved/
  dismissed case can already be closed through the approved return paths.
* Evidence of the defect on staging: LND-WMPSRN (case DC-2026-100000,
  `direct_settlement`) is `ended` with NULL `closure_reason`/`closure_via`
  and zero `contract_closed` audit events.

### Smallest migration — `20260502130700_dispute_resolution_keeps_contract_open.sql`
1. `CREATE OR REPLACE FUNCTION public.on_damage_case_resolved()` with the
   contract-ending and eligibility-releasing block REMOVED. Kept verbatim:
   the `dispute_phase = 'resolved'` sync for settled/unresolved, and the
   dismissal sync (`dispute_outcome` default `'dismissed'`). The second
   UPDATE still omits `status` from SET, so the trigger never re-fires.
2. Additive, honest audit (recommended, small): when a case becomes
   terminal while its contract is still `active`, write one
   `contract_events` row `dispute_terminal_recorded` (contract_id,
   invoice_id, reason = outcome, metadata {case_id, case_status}) stating
   that the rental lifecycle is unaffected. It records a fact that is
   true, invents no return/loss evidence, and lets the Package 1 panel
   timeline show "claim settled — rental continues".
3. `COMMENT ON FUNCTION` documenting the PO principle and the date.
4. Nothing else changes: trigger DDL (same name/timing), the four terminal
   RPCs, `resolve_dispute_case`, `close_rental_contract`,
   `finalize_contract_closure`, RLS, grants are all untouched. No enum
   additions (no `asset_not_returned`, no `settlement` via) — the write-off
   process is explicitly out of scope.
5. History: no backfill. LND-WMPSRN stays exactly as recorded; the migration
   header documents it as the pre-fix record. (A separate, optional
   read-only validation query lists any contract ended by the legacy
   trigger — `ended` with NULL closure fields and a non-dismissed terminal
   case — for the record only.)
6. Apply mechanics identical to 130600: guarded SQL-Editor script
   (`apply_20260502130700_sql_editor.sql`) with staging-marker gate,
   exactly 67 prior history rows, not-already-applied gate, atomic history
   insert, read-only validation rows (function source no longer references
   `rental_contracts`/`rental_eligibility`; trigger present; history 68).
   Rollback = forward-fix only (re-running the 124700 function block would
   restore the defect; not recommended).

### What changes in behavior / dependencies reviewed
* After any terminal outcome the contract stays `active` and eligibility
  stays committed until the merchant closes via Package 1 (reason derived
  `returned`/`returned_early`, audited, single release) or the customer
  return-declaration path completes. Confirmed by code: closure guards only
  consider open/escalated cases, so these paths work after a terminal case.
* `damage_cases_one_unresolved_per_contract` (partial unique index) allows
  a NEW case after a terminal one; closure is blocked again while it is
  open (P0022). Intended.
* Frontend already handles the new state without changes: the merchant
  adapter derives `closureStatus='damaged'` only for open/escalated cases;
  a terminal case + active contract renders the normal active state (Close
  / Report buttons return; `MerchantRentalClose` normal path). The
  customer Home "current rental" card keeps showing the active rental.
  Merchant timeline nuance (existing behavior, not new): the synthetic
  "تم إرجاع الأصل" step is suppressed whenever a non-dismissed case exists;
  after a Package 1 close the real `contract_closed` event (and the optional
  `dispute_terminal_recorded` event) carry the truth in the closure panel.
  Follow-up (optional, UI only): read the closure reason from
  `contract_events` instead of the synthetic step.
* Promissory-note settlement inside `finalize_contract_closure` already
  requires "no non-dismissed case"; with a settled case the note stays
  unsettled at closure (no notes are issued in the current simplified
  phase). Policy question for the PO, not changed here.
* Existing tests: no SQL suite (`settlement_offer_cap_test`,
  `admin_dismiss_test`, `customer_response_deadline_test`,
  `closure_lifecycle_test`) asserts "ended on resolution"; no node
  structural test and no locale copy promises it (only
  `errors.closeBlockedByOpenCase`). Blast radius of the change is the
  trigger body alone.
* Recommended merchant copy (optional, FE, both languages): on a resolved
  case page, a one-line hint that the rental continues and must be closed
  on receipt through the normal close path.

### D-1 regression matrix — new suite `supabase/tests/dispute_resolution_contract_independence_test.sql`
Hosted-faithful local replica (pgcrypto in `extensions`), single
transaction + ROLLBACK, same helper style as `closure_lifecycle_test.sql`.
| # | Scenario | Expected |
|---|---|---|
| 1 | partial, `claim_accepted` | case settled; contract `active`; `used_amount` unchanged; no `contract_closed` event; `dispute_terminal_recorded` present |
| 2 | partial, `direct_settlement` (round-1 accept) | same as 1 |
| 3 | partial, two rejections → `lend_mediation` | not terminal; contract active; eligibility unchanged |
| 4 | `lend_settlement` (both accept Lend proposal) | case settled; contract active; eligibility unchanged |
| 5 | `unresolved` (Lend proposal rejected) | case unresolved; contract active; eligibility unchanged |
| 6 | **total** severity, `claim_accepted` | contract active (no auto-end), eligibility unchanged |
| 7 | **non_return** severity, `direct_settlement` | contract active, eligibility unchanged |
| 8 | `dismissed` with reason | contract active (unchanged behavior); `contract_closed` absent |
| 9 | After 1: merchant `close_rental_contract` | `ended`, reason derived by clock, `closure_via='merchant'`, eligibility released exactly once, `contract_closed` event |
| 10 | After 4: customer `request_contract_closure('return_declared')` + merchant confirm | `ended`/`returned_early`/`mutual`, single release |
| 11 | After 8: normal close | works; single release |
| 12 | Terminal outcome on a contract already `ended` (fixture ended first via Package 1 with a dismissed case, then an out-of-band status flip) | no error, contract untouched, phase sync still runs |
| 13 | Out-of-band `UPDATE damage_cases SET status='settled'` | `dispute_phase` synced; contract untouched |
| 14 | New case after a settled one | insert allowed; close blocked P0022; after dismissal close works |
| 15 | Eligibility exactly-once: activation → settlement → close | 0 → value → value → 0 |
| 16 | Function source guard | `on_damage_case_resolved` no longer references `rental_contracts`/`rental_eligibility` |
Plus re-run of all existing SQL suites and the full local battery (tsc,
build, i18n, node suites, Playwright 24). Hosted post-apply checks: 14-row
apply validation + one read-only query confirming the trigger/function and
that LND-WMPSRN is unchanged.

---

## D-2 — Home available-balance uses the authoritative breakdown

### Current code (verified)
`Home.tsx` renders `EligibilityCompact` with `adaptEligibility(dbEligibility)`
→ `remaining = limit − used` from the raw `rental_eligibility` row the auth
provider fetches; reservations from issued offers / pending contracts are
ignored. The authoritative RPC `get_my_eligibility_breakdown()`
(limit/used/reserved/available) is live on staging and already used by
`Eligibility.tsx` — which, however, falls back to `limit − used − 0` when
the RPC returns null (same overstated class, flagged below).

### Smallest change (files)
1. `src/lib/cache/keys.ts` — `cacheKeys.eligibilityBreakdown(uid)` =
   `eligibility:${uid}:breakdown`; TTL `CACHE_TTL.customerLists` (2 min)
   with `refetchOnFocus`, consistent with the Home lists.
2. `src/lib/useCustomerRentalData.ts` — fifth cached query calling
   `fetchMyEligibilityBreakdown()`; exposes `breakdown` and
   `breakdownState: 'loading' | 'ready' | 'unavailable'`; included in
   `refresh()` so pull-to-refresh revalidates it; inert in demo mode.
3. `src/pages/Home.tsx` — `EligibilityCompact` receives
   `available: number | null` + `state`. Render rules (configured mode):
   `ready` → `max(0, breakdown.available)`; `loading` with no cached value
   → placeholder "—"; `unavailable` → "—" plus `home.eligibilityCompact.
   unavailable` ("تعذّر تحديث الرصيد المتاح — اسحب للتحديث" /
   "Couldn't refresh the available balance — pull to refresh"), the card
   still opens `/eligibility`. The `limit − used` figure is NEVER shown as
   the available amount in configured mode. Demo mode keeps the demo store
   value (no RPC exists there). A customer without an eligibility row keeps
   today's 0/0 empty state.
4. `src/pages/Review.tsx` — invalidate `cacheKeys.eligibilityBreakdown(uid)`
   beside the existing `cacheKeys.eligibility(uid)` invalidation on accept /
   activation, so the figure drops immediately after a reservation or
   activation.
5. `src/locales/ar.json`, `src/locales/en.json` — two keys
   (`home.eligibilityCompact.unavailable`, `.loading`).
6. `src/pages/Eligibility.tsx` — **decision needed**: preserve as-is (PO
   wording) or apply the same rule (show "—"/unavailable instead of
   `limit − used` when the RPC fails). Recommended: apply the same rule; it
   is a two-line change in the same spirit and removes the last overstated
   fallback.

### D-2 regression
* `scripts/home-eligibility.test.mjs` (`node --test`, structural guards
  like `settlement-cap.test.mjs`): Home's compact widget no longer renders
  `eligibility.remaining`; `useCustomerRentalData` includes the breakdown
  query in `refresh`; `Review.tsx` invalidates the breakdown key; both
  locale files carry the two keys; `Eligibility.tsx` contains no
  `limit - used` fallback (if item 6 approved). Added to `package.json`
  as `test:home-eligibility`.
* i18n parity suite (9 tests) covers the new keys; Playwright 24 (demo
  mode) unchanged; tsc/build.
* Hosted acceptance (after deploy): for `new+customer@lend.test` issue one
  fictional offer (reservation 4,800) — Home must show
  limit − used − reserved (e.g. 15,400) while `limit − used` would read
  20,200; then cancel the offer and confirm the figure returns. RPC-failure
  state verified locally by blocking the RPC route in Playwright.

---

## Execution order (when approved)
1. D-1 migration + SQL suite authored and run locally (full chain, replica).
2. D-2 frontend + tests; full local battery.
3. Commit/push to the feature branch; PO applies `apply_20260502130700_sql_editor.sql` in the lend-test SQL Editor (gates: marker, 67 rows, not applied) and confirms the validation rows.
4. Deploy the branch head to `lend-staging`; run the hosted acceptance checks above.
5. Resume the owner-assisted admin tests; the mediation fixture
   DC-2026-100001 can then be driven to a terminal outcome without ending
   LND-A8Z825.
