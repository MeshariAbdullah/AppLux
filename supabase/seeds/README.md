# Lend — SQL seeds

Idempotent SQL scripts you paste into the Supabase SQL Editor to set up
realistic test data. **Not migrations** — these are data, not schema, and
they intentionally live outside `supabase/migrations/` so they don't run
as part of normal database setup.

## customer_scenarios.sql

Creates four customer accounts that exercise the four meaningful states
of the signed-in customer dashboard, plus one shared merchant they
transact with.

| Email                          | Password    | Scenario           | Eligibility (limit / used) | Live invoices | Active contracts | Active notes | History |
|--------------------------------|-------------|--------------------|----------------------------|---------------|------------------|--------------|---------|
| `new+customer@lend.test`       | `Lend!2026` | New customer       | 25,000 / 0                 | 0             | 0                | 0            | 0       |
| `active+customer@lend.test`    | `Lend!2026` | Active customer    | 50,000 / 18,500            | 1 (accepted)  | 1                | 1            | 0       |
| `history+customer@lend.test`   | `Lend!2026` | History customer   | 35,000 / 0                 | 0 active      | 0                | 0            | 2 ended |
| `action+customer@lend.test`    | `Lend!2026` | Action required    | 40,000 / 12,000            | 1 (issued, expires +2d) | 0     | 0            | 1 ended |

The shared merchant is **"بيت الفساتين" / "House of Dresses"** (Riyadh).

Re-running the file is safe — every insert uses a fixed UUID + `on
conflict do update`. The final `select` is a sanity check; comment it
out if you don't need it.

## customer_scenarios_reset.sql

Wipes only the four seeded customer accounts, their dependent rows
(invoices, items, contracts, notes, eligibility), and the seeded
merchant. Targeted by UUID, so production data is untouched.

## Typical workflow

```text
1. Paste supabase/seeds/customer_scenarios.sql into Supabase SQL Editor → Run.
2. Test the customer dashboard by signing in as each of the four emails.
3. (When done) paste supabase/seeds/customer_scenarios_reset.sql → Run.
```
