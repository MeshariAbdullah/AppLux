# Legacy eligibility defects D1/D2 — read-only assessment

**Status: assessment only. Nothing in this document has been executed.
Every statement in §1–§2 is a plain `SELECT` — no writes, no locks
beyond normal reads, safe to run on production. The remediation in §3
is a PROPOSAL and requires separate approval before anything runs.**

## Background

The eligibility hold accounting changed twice, leaving three
generations of contracts:

- **Gen 1** (before `20260502120500`): acceptance bumped
  `rental_eligibility.used_amount` by invoice `total_amount`;
  `original_item_value` columns did not exist (rows default to `0`).
- **Gen 2** (`20260502120500`): acceptance bumps by
  `original_item_value` and mirrors it onto the contract; close/damage
  decrement by the contract mirror.
- **Gen 3** (`20260502121300` split + `20260502122400` current):
  acceptance creates the contract **without** the mirror (D2); the
  legacy activation `verify_and_activate_rental` bumps `used_amount`
  by **`total_amount`** (D1) while close/damage decrement by
  **`original_item_value`** — an asymmetric pair. The current-phase
  `activate_rental_without_payment_and_note` repairs the mirror at
  activation time and holds `original_item_value`, so contracts
  activated through it are consistent.

**Defects**

- **D1 — asymmetric hold:** a contract activated via
  `verify_and_activate_rental` added `total_amount` to `used_amount`,
  but closing it subtracts `contract.original_item_value`. If the
  mirror is `0`, closing releases nothing (hold stuck forever); if the
  mirror differs from `total_amount`, a residue of
  `total_amount − original_item_value` stays behind.
- **D2 — missing mirror:** contracts created by the Gen-3
  `accept_rental_invoice` carry `original_item_value = 0` until the
  new activation RPC repairs them. Any that were activated by the
  LEGACY RPC (which does not repair) or that are still `pending` keep
  the zero mirror.

Both defects distort `used_amount`, which directly limits how much a
customer can rent. `greatest(0, …)` and the
`used_within_limit` check mean drift only accumulates — it never
self-corrects.

---

## 1. Read-only counts

Run each statement as-is in the Supabase SQL editor (read-only). They
are independent; run all six for the full picture.

```sql
-- 1a. ACTIVE contracts with a missing/zero original_item_value mirror
--     (D2 exposure on open rentals — closing them will release 0)
select count(*) as active_missing_mirror
from public.rental_contracts c
where c.status = 'active'
  and coalesce(c.original_item_value, 0) = 0;

-- 1b. ENDED contracts with a missing/zero mirror
--     (already closed with a 0 release — their hold residue, if the
--      activation ever bumped used_amount, is still parked on the customer)
select count(*) as ended_missing_mirror
from public.rental_contracts c
where c.status in ('ended', 'cancelled')
  and coalesce(c.original_item_value, 0) = 0;

-- 1c. PENDING legacy contracts (accepted, never activated) —
--     the acceptance-generation split matters for remediation order
select count(*) as pending_contracts,
       count(*) filter (where coalesce(c.original_item_value, 0) = 0)
         as pending_missing_mirror
from public.rental_contracts c
where c.status = 'pending';

-- 1d. Contracts whose mirror DISAGREES with their invoice
--     (both non-zero but different — indicates a mid-migration edit)
select count(*) as mirror_disagrees_with_invoice
from public.rental_contracts c
join public.rental_invoices i on i.id = c.invoice_id
where coalesce(c.original_item_value, 0) <> coalesce(i.original_item_value, 0);

-- 1e. Customers whose used_amount does not match the expected sum of
--     ACTIVE-contract holds (the canonical D1/D2 impact number).
--     Expected hold per active contract = the same precedence the
--     current activation RPC uses:
--       contract mirror → invoice value → contract total (legacy fallback)
with expected as (
  select
    c.customer_user_id,
    sum(
      coalesce(
        nullif(c.original_item_value, 0),
        nullif(i.original_item_value, 0),
        c.total_amount
      )
    ) as expected_hold
  from public.rental_contracts c
  join public.rental_invoices i on i.id = c.invoice_id
  where c.status = 'active'
  group by c.customer_user_id
)
select
  count(*)                                   as customers_with_drift,
  sum(abs(e.used_amount - coalesce(x.expected_hold, 0)))
                                             as total_abs_drift
from public.rental_eligibility e
left join expected x on x.customer_user_id = e.user_id
where e.used_amount <> coalesce(x.expected_hold, 0);

-- 1f. Direction of the drift (over-held blocks customers; under-held
--     over-extends credit) — split of 1e
with expected as (
  select c.customer_user_id,
         sum(coalesce(nullif(c.original_item_value, 0),
                      nullif(i.original_item_value, 0),
                      c.total_amount)) as expected_hold
  from public.rental_contracts c
  join public.rental_invoices i on i.id = c.invoice_id
  where c.status = 'active'
  group by c.customer_user_id
)
select
  count(*) filter (where e.used_amount > coalesce(x.expected_hold, 0)) as over_held_customers,
  count(*) filter (where e.used_amount < coalesce(x.expected_hold, 0)) as under_held_customers
from public.rental_eligibility e
left join expected x on x.customer_user_id = e.user_id
where e.used_amount <> coalesce(x.expected_hold, 0);
```

## 2. Read-only preview (row-level, customer id masked)

Shows every suspect contract with the delta that remediation would
address. `customer_ref` is a stable 8-char digest — enough to group
rows per customer without exposing the UUID; drop the alias line and
select `c.customer_user_id` directly only if you need to act on a
specific account.

```sql
select
  c.id                                    as contract_id,
  c.contract_number,
  c.status,
  left(md5(c.customer_user_id::text), 8)  as customer_ref,   -- masked
  c.total_amount                          as contract_total_amount,
  i.original_item_value                   as invoice_item_value,
  c.original_item_value                   as contract_mirror,
  coalesce(
    nullif(c.original_item_value, 0),
    nullif(i.original_item_value, 0),
    c.total_amount
  )                                       as expected_active_hold,
  case
    when c.status = 'active'
      then coalesce(nullif(c.original_item_value, 0),
                    nullif(i.original_item_value, 0),
                    c.total_amount)
    else 0
  end - case
    -- what close/damage WOULD release today
    when c.status = 'active' then coalesce(c.original_item_value, 0)
    else 0
  end                                     as suspected_release_shortfall
from public.rental_contracts c
join public.rental_invoices i on i.id = c.invoice_id
where coalesce(c.original_item_value, 0) = 0
   or coalesce(c.original_item_value, 0) <> coalesce(i.original_item_value, 0)
order by c.status, c.created_at desc;
```

And the per-customer eligibility view:

```sql
with expected as (
  select c.customer_user_id,
         sum(coalesce(nullif(c.original_item_value, 0),
                      nullif(i.original_item_value, 0),
                      c.total_amount)) as expected_hold,
         count(*)                      as active_contracts
  from public.rental_contracts c
  join public.rental_invoices i on i.id = c.invoice_id
  where c.status = 'active'
  group by c.customer_user_id
)
select
  left(md5(e.user_id::text), 8)        as customer_ref,      -- masked
  e.limit_amount,
  e.used_amount,
  coalesce(x.expected_hold, 0)         as expected_hold,
  e.used_amount - coalesce(x.expected_hold, 0) as drift,
  coalesce(x.active_contracts, 0)      as active_contracts
from public.rental_eligibility e
left join expected x on x.customer_user_id = e.user_id
where e.used_amount <> coalesce(x.expected_hold, 0)
order by abs(e.used_amount - coalesce(x.expected_hold, 0)) desc;
```

## 3. Proposed remediation — **DO NOT EXECUTE, approval required**

Three steps, in order. Each is idempotent (re-running produces the
same end state) and none double-adjusts, because step 2 *recomputes
from scratch* rather than applying deltas.

**Step R1 — backfill the contract mirror** (fixes D2 storage):

```sql
-- PROPOSAL ONLY
update public.rental_contracts c
set original_item_value = coalesce(
      nullif(i.original_item_value, 0),
      c.total_amount            -- legacy invoices predating the column
    ),
    updated_at = now()
from public.rental_invoices i
where i.id = c.invoice_id
  and coalesce(c.original_item_value, 0) = 0;
```

**Step R2 — recompute eligibility from currently-ACTIVE contracts**
(fixes D1 drift; absolute recomputation → idempotent, no double
adjustment; run AFTER R1 so mirrors are trustworthy):

```sql
-- PROPOSAL ONLY
with expected as (
  select c.customer_user_id, sum(c.original_item_value) as expected_hold
  from public.rental_contracts c
  where c.status = 'active'
  group by c.customer_user_id
)
update public.rental_eligibility e
set used_amount = least(coalesce(x.expected_hold, 0), e.limit_amount),
    updated_at  = now()
from (select user_id from public.rental_eligibility) ids
left join expected x on x.customer_user_id = ids.user_id
where e.user_id = ids.user_id
  and e.used_amount is distinct from least(coalesce(x.expected_hold, 0), e.limit_amount);
```

  Note the `least(…, limit_amount)` clamp: a recomputed hold above the
  limit would otherwise violate `rental_eligibility_used_within_limit`.
  Rows that clamp should be reviewed manually (the customer is
  genuinely over-extended).

**Step R3 — fix the legacy activation source** so drift cannot
re-accumulate: change `verify_and_activate_rental`
(`20260502121300`, line ~264) to bump `used_amount` by the same
`coalesce(nullif(contract mirror,0), nullif(invoice value,0),
total_amount)` precedence the current-phase RPC uses — or, since the
flag keeps that path unreachable from the UI, revoke EXECUTE on it
until the payments phase returns. Either way this is a migration file,
reviewed separately.

**Safety protocol for the whole run:**
1. Take/verify a backup or PITR point first.
2. Run §1/§2 and snapshot the outputs (before-picture).
3. Wrap R1+R2 in a single transaction; re-run the §1 counts inside
   the transaction — 1a/1b/1e should drop to 0 (minus clamped rows) —
   then commit, otherwise rollback.
4. Re-run §1 after commit (after-picture) and archive both.

**Rollback plan:** R1/R2 overwrite two numeric columns. Before
running, snapshot them:

```sql
-- PROPOSAL ONLY (snapshot tables live in a scratch schema)
create table if not exists scratch.contracts_oiv_backup as
  select id, original_item_value, updated_at from public.rental_contracts;
create table if not exists scratch.eligibility_used_backup as
  select user_id, used_amount, updated_at from public.rental_eligibility;
```

Rollback = `update … set … from scratch.…` restores of those two
columns. PITR remains the last resort.

## 4. Risk classification

| Item | Risk | Why |
| --- | --- | --- |
| Over-held customers (1f `over_held`) | **High** | Real customers blocked from renting below their approved limit — direct revenue/UX impact, invisible unless they complain. |
| Active contracts with zero mirror (1a) | **High** | Every close/damage on them releases 0 — the over-hold population grows with each closure until remediated. |
| Under-held customers (1f `under_held`) | **Critical** if non-zero | Credit extended beyond the approved ceiling — business-risk exposure, should gate any new rentals for those accounts until fixed. |
| Ended contracts with zero mirror (1b) | **Medium** | Historical only, but their residue is included in 1e drift; fixed by R2, no per-contract action needed. |
| Mirror ≠ invoice on non-zero rows (1d) | **Medium** | Indicates manual edits or partial migration; review individually before R1 (R1 skips them — it only touches zero mirrors). |
| Pending legacy contracts (1c) | **Low** | No hold was ever added for pending Gen-3 rows; the current activation RPC repairs their mirror on activation. |
| Legacy RPC left callable (R3) | **Medium** | Unreachable from the flagged-off UI, but any direct caller re-introduces D1 drift. |

## 5. What to run manually in Supabase

To get the real numbers, run in the **SQL Editor of the production
project** (read-only, in this order):

1. §1 queries 1a–1f — six count rows: the size of the problem.
2. §2 query 1 — the per-contract preview (export CSV, archive).
3. §2 query 2 — the per-customer drift list (export CSV, archive).

Send back the 1e/1f numbers (`customers_with_drift`,
`total_abs_drift`, `over_held`, `under_held`) plus whether 1d is zero
— those four facts decide whether remediation is a quiet maintenance
task or needs customer-by-customer review, and nothing in §3 should be
approved before they are known.
