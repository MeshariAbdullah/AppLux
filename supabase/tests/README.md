# Database tests

SQL assertion suites run against a **local** replay of `supabase/migrations`
(never against production). Each suite aborts on the first failed assertion
(`\set ON_ERROR_STOP on`); reaching the final `===== … PASSED =====` banner
means every assertion held.

## Suites

- `merchant_onboarding_schema_test.sql` — unified-number format/uniqueness,
  `commercial_reg_number` nullability, multi-activity tables, branch
  `map_url` https/Google constraint, `merchant_documents` scope + review
  constraints, private bucket + 5 MB limit, and quarantine-ticket orphan
  listing / finalize (Commit A migrations 20260502123900 + 124000).
- `merchant_signup_claim_test.sql` — the signup trigger's merchant branch
  end-to-end: unified number, `categories[]` → activities, branch map URL,
  and the **atomic** CR-document receipt claim (happy path, missing /
  expired / already-claimed receipt aborts, invalid map/unified aborts,
  and — critically — a failed signup does **not** consume the receipt so a
  retry is idempotent).

## Edge Function CORS

- `edge_cors_test.mjs` — transpiles `supabase/functions/_shared/cors.ts`
  with esbuild and asserts the browser CORS contract for the
  merchant-doc-upload function: OPTIONS preflight → 200, `authorization`
  / `x-client-info` / `apikey` / `content-type` all allowed, POST/OPTIONS
  methods, and CORS headers on both success and error JSON responses.
  Run with `node supabase/tests/edge_cors_test.mjs`.

## Running locally

Replay the migration chain into a scratch Postgres, then:

```
psql -d lend -v ON_ERROR_STOP=1 -f supabase/tests/merchant_onboarding_schema_test.sql
psql -d lend -v ON_ERROR_STOP=1 -f supabase/tests/merchant_signup_claim_test.sql
```

Fixtures use dedicated test UUIDs (`11111111-…`, `22222222-…`) and rely on
the signup trigger to create profiles from `auth.users` inserts, so run each
suite against a freshly replayed database.
