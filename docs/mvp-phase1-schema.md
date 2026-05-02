# AppLux MVP — Phase 1 Database Schema

Phase 1 establishes the Postgres / Supabase foundation behind the existing demo. No
frontend wiring yet — this phase is **schema only**, with RLS, triggers, and helper
functions in place so Phase 2 can plug the UI in incrementally.

## Out of scope for Phase 1
- Payment processing
- Nafath identity verification (placeholder timestamp columns only)
- Nafith digital attestation (placeholder timestamp columns only)
- Notifications, email/SMS delivery
- File upload UX (storage bucket reserved for Phase 2)
- Frontend integration

## Roles

Three roles, stored as `profiles.role` (`app_role` enum):

| Role        | Capability                                                                            |
| ----------- | ------------------------------------------------------------------------------------- |
| `customer`  | Browses partner boutiques, scans QR invoices, accepts contracts, tracks documents.    |
| `merchant`  | Issues invoices, signs contracts/notes, raises damage cases for the boutique they own. |
| `admin`     | Reviews merchant applications, sets eligibility, oversees damage cases, audits.        |

Role escalation flows:
- `customer → merchant` via `merchant_applications` (admin approval flips both `profiles.role` and creates a `merchants` row).
- `admin` is provisioned manually via SQL (no self-signup); see Bootstrap section.

## Table list

| Table                  | Purpose                                                              | Owned by     |
| ---------------------- | -------------------------------------------------------------------- | ------------ |
| `profiles`             | Public mirror of `auth.users` + role/account status                  | self / admin |
| `merchant_applications`| Customer's request to become a merchant                              | applicant / admin |
| `merchants`            | Approved boutique entity (operational + consumer-facing)             | merchant / admin |
| `merchant_branches`    | Physical pickup/drop-off locations under a merchant                  | merchant     |
| `rental_eligibility`   | Admin-assigned credit ceiling per customer                           | admin        |
| `rental_invoices`      | Invoice issued by merchant; QR-scannable by customer                 | merchant     |
| `rental_invoice_items` | Line items inside an invoice                                         | merchant     |
| `rental_contracts`     | Created when customer accepts an invoice                             | merchant + customer |
| `promissory_notes`     | Separate signed financial instrument tied to contract                | merchant + customer |
| `damage_cases`         | Raised when item returned damaged or not at all                      | merchant + admin |
| `damage_evidence`      | Photos/videos/documents attached to a case (Storage path references) | merchant + admin |

Plus four sequences for human-readable numbers:
`invoice_number_seq`, `contract_number_seq`, `note_number_seq`, `case_number_seq`.

## Relationship map

```
auth.users ──1:1── profiles
                     │
                     ├──1:* merchant_applications (applicant_user_id)
                     │
                     ├──1:1 merchants (owner_user_id)             ← role lifts to 'merchant' on approval
                     │        │
                     │        └──1:* merchant_branches
                     │
                     ├──1:1 rental_eligibility
                     │
                     ├──1:* rental_invoices    (customer_user_id) ─┐
                     ├──1:* rental_contracts   (customer_user_id)  │ merchants ──1:* rental_invoices    (merchant_id)
                     ├──1:* promissory_notes   (customer_user_id)  │ merchants ──1:* rental_contracts   (merchant_id)
                     └──1:* damage_cases       (customer_user_id)  │ merchants ──1:* promissory_notes   (merchant_id)
                                                                   │ merchants ──1:* damage_cases       (merchant_id)
                                                                   │
rental_invoices    ──1:* rental_invoice_items ─────────────────────┘
rental_invoices    ──1:1 rental_contracts (invoice_id)
rental_contracts   ──1:1 promissory_notes  (contract_id)
rental_contracts   ──1:* damage_cases      (contract_id)
damage_cases       ──1:* damage_evidence
```

Cardinality notes:
- A merchant has exactly one `owner_user_id` (1:1 enforced by `unique`).
- A contract is created from exactly one invoice (1:1 enforced by `unique`).
- A contract has at most one promissory note (1:1 enforced by `unique`).
- A contract can have multiple damage cases (e.g., partial damage + later non-return).

## Type / enum reference

| Enum                          | Values                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `app_role`                    | `customer`, `merchant`, `admin`                              |
| `account_status`              | `pending`, `active`, `suspended`                             |
| `merchant_application_status` | `pending`, `approved`, `rejected`                            |
| `merchant_status`             | `pending_review`, `active`, `suspended`                      |
| `rental_category`             | `dress`, `bag`, `watch`, `bisht`                             |
| `eligibility_tier`            | `standard`, `premium`, `elite`                               |
| `invoice_status`              | `draft`, `issued`, `viewed`, `accepted`, `rejected`, `cancelled`, `superseded` |
| `contract_status`             | `pending`, `active`, `ended`, `cancelled`                    |
| `note_status`                 | `pending`, `signed`, `settled`, `defaulted`                  |
| `damage_severity`             | `partial`, `total`, `non_return`                             |
| `damage_stage`                | `review`, `settlement`, `nafith`, `execution`                |
| `damage_status`               | `open`, `settled`, `escalated`, `dismissed`                  |
| `evidence_type`               | `photo`, `video`, `document`                                 |

## Conventions

- **Primary keys:** `uuid` with `gen_random_uuid()`; `profiles.id` is the `auth.users.id`.
- **Timestamps:** `timestamptz`; `created_at` defaulted, `updated_at` auto-bumped via `set_updated_at()` trigger.
- **Money:** `numeric(12,2)` SAR.
- **Localized text:** `jsonb` shaped `{ "ar": "...", "en": "..." }`. Keeps the demo's `Localized` shape and lets us add languages without column migrations.
- **Document numbers:** generated via `next_invoice_number()`, `next_contract_number()`, `next_note_number()`, `next_case_number()` — produce strings like `INV-2026-000123`.
- **Nafath / Nafith:** placeholder `*_at` timestamp columns on profiles, contracts, and notes. Kept null until Phase 3 wires the real integrations.

## RLS access matrix (summary)

| Table                  | customer (self)                | merchant (own)                        | admin     | public anon |
| ---------------------- | ------------------------------ | ------------------------------------- | --------- | ----------- |
| profiles               | RW (own)                       | —                                     | RW (all)  | —           |
| merchant_applications  | R + insert (own)               | —                                     | R + update | —          |
| merchants              | R (active)                     | R + update (own)                      | RW (all)  | R (active)  |
| merchant_branches      | R (under active merchants)     | RW (own)                              | RW (all)  | R (under active) |
| rental_eligibility     | R (own)                        | —                                     | RW (all)  | —           |
| rental_invoices        | R + update (own as customer)   | RWI (own merchant)                    | RW (all)  | —           |
| rental_invoice_items   | R via parent invoice           | RW via parent invoice                 | RW (all)  | —           |
| rental_contracts       | R (own as customer)            | RWI (own merchant)                    | RW (all)  | —           |
| promissory_notes       | R (own as customer)            | RWI (own merchant)                    | RW (all)  | —           |
| damage_cases           | R (own as customer)            | RWI in stages `review`/`settlement`   | RW (all)  | —           |
| damage_evidence        | R via parent case              | I via own case                        | RW (all)  | —           |

R = SELECT, W = UPDATE, I = INSERT.

Helper functions used by policies (`SECURITY DEFINER`, search_path locked):
- `public.current_app_role() → app_role`
- `public.is_admin() → boolean`
- `public.is_merchant_owner(merchant_id uuid) → boolean`

## Migration plan

Migrations live under `supabase/migrations/` with the standard `YYYYMMDDHHMMSS_*.sql` naming. Apply in order:

| File                                              | What it does                                         |
| ------------------------------------------------- | ---------------------------------------------------- |
| `20260502120000_initial_schema.sql`               | Extensions, enums, sequences, tables, indexes        |
| `20260502120100_triggers_and_functions.sql`       | `updated_at` triggers, profile auto-creation, role helpers, document number generators |
| `20260502120200_rls_policies.sql`                 | RLS enable + policies for every table                |

### Applying

```bash
# Local Supabase project (assumes `supabase init` has been run separately)
supabase db reset            # nukes local DB and re-applies all migrations + seed
# or
supabase migration up        # applies pending migrations only

# Remote (linked) project
supabase db push
```

### Bootstrap

After the first migration, promote your initial admin user manually in SQL:

```sql
update public.profiles
set role = 'admin', account_status = 'active'
where email = 'admin@applux.app';
```

(The trigger `on_auth_user_created` will have created the row; this just lifts the role.)

## Phase 2 plan

Once Phase 1 lands cleanly, Phase 2 wires the front-end onto the schema in narrow vertical slices:

1. **Supabase client + auth wiring**
   - Add `@supabase/supabase-js`, env vars, `src/lib/supabase.ts` client
   - Replace the localStorage-backed `useStore` session shape with Supabase auth session
   - Email + password sign-in for MVP (OTP/Nafath later)

2. **Profile & eligibility read path**
   - Replace `DEFAULT_ELIGIBILITY` seed with a `select * from rental_eligibility` for the current user
   - Read `profiles` for greeting / nav

3. **Merchant onboarding loop (vertical slice)**
   - Customer Welcome → MerchantRegister submits an `insert into merchant_applications`
   - AdminMerchants list reads from `merchant_applications` and updates status
   - On approval, an Edge Function (or admin RPC) creates the `merchants` row, sets `profiles.role = 'merchant'`

4. **Merchant invoice creation + customer scan flow**
   - MerchantInvoiceNew writes `rental_invoices` + `rental_invoice_items`, returning `scan_token`
   - Customer scan resolves `scan_token` → review → on accept, write `rental_contracts` + `promissory_notes` + bump `rental_eligibility.used_amount`
   - Realtime channel on `rental_invoices` for the merchant's "live" approvals list

5. **Damage case capture + evidence upload**
   - Storage bucket `damage-evidence` with merchant-write / admin-read policies
   - MerchantRentalClose damage flow writes `damage_cases` + uploads `damage_evidence` rows
   - AdminCases pulls cases sorted by stage/severity

6. **Computed views (on-demand)**
   - `merchant_dashboard_summary` (active count, due-soon count, monthly revenue)
   - `admin_overdue_buckets` (1-7 / 8-30 / 31-60 / 60+ from `promissory_notes` past `due_date`)
   - These start as views; promote to materialized views if hot.

Phase 3+ (out of scope to plan in detail today): Nafath identity, Nafith attestation, payments (Mada/Apple Pay), notifications, audit log.
