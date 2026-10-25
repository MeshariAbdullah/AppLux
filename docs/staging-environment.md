# Lend — staging environment (lend-test) bring-up runbook

Two Supabase projects, and a naming trap to respect at every step:

| Role | Supabase project name | Notes |
|------|----------------------|-------|
| **PRODUCTION** | `lend-staging` | Despite the name: LIVE data, real customers. **Never touched by anything in this runbook.** |
| **STAGING** | `lend-test` | New, empty. The only target of every command below. |

Because the names actively mislead, nothing here trusts a name: the
guard script (`scripts/supabase-guard.sh`) compares the CLI's linked
**project ref** against `supabase/environments.json` before every push,
the bootstrap SQL refuses to run on a populated database, and staging
scripts can check the `public.environment_marker` row that only staging
carries. Recommended (cosmetic, safe — refs/keys don't change): rename
the projects in the Supabase Dashboard to `lend-prod` / `lend-test`.

What a complete staging environment consists of (from the repo audit):
the 64-file migration chain (26 tables, ~83 functions, 27 triggers,
78 RLS policies, realtime on `notifications`, `merchant-documents`
bucket), **plus** the pieces production got outside migrations: the
`damage-evidence` bucket (now covered by `staging_bootstrap.sql`), the
six Edge Functions with their secrets, Auth URL/SMTP configuration, and
the optional pg_cron schedule for `push-dispatch`.

---

## Phase A — database (Supabase CLI, repeatable)

**A0. One-time prerequisites (your machine)**

1. Install the Supabase CLI (`brew install supabase/tap/supabase` or
   see supabase.com/docs/guides/cli), and `supabase login`.
2. Fill in **both** project refs in `supabase/environments.json`
   (Dashboard → the project → Settings → General → *Reference ID*; it's
   also the subdomain of the project URL). The guard refuses to run
   while either value is still `FILL_ME_*` — the production ref is
   there purely so the guard can recognize and reject it.
3. Have the lend-test **database password** at hand (set when the
   project was created; resettable under Settings → Database).

**A1. Link the CLI to lend-test — and prove it**

```bash
supabase link --project-ref <LEND_TEST_REF>   # prompts for the DB password
scripts/supabase-guard.sh staging check        # must print GUARD OK
```

`supabase link` writes the ref to `supabase/.temp/project-ref`; the
guard fails closed if that file is missing, mismatched, still a
placeholder, or equal to the production ref.

**A2. Apply the whole migration chain (instead of 64 manual pastes)**

```bash
scripts/supabase-guard.sh staging db-push
```

That runs `supabase db push --linked`: all files in
`supabase/migrations/` in order, recorded in
`supabase_migrations.schema_migrations`, so re-running is a no-op and
future migrations apply incrementally. The chain was replay-verified
end-to-end on a fresh local Postgres 16 (migration 20260502122300
needed a replay fix — a `drop function` before a `create or replace`
that changes the function's row type; the end state is identical to
production's).

**A3. Bootstrap the staging-only pieces**

SQL Editor (lend-test!) → paste and run
`supabase/maintenance/staging_bootstrap.sql`. It
(1) aborts unless the database is empty or already marked staging,
(2) writes the `environment_marker` row, and
(3) creates the private `damage-evidence` bucket
(10 MB, jpeg/png/webp — adjust if production's Dashboard values differ).

**A4. Verify**

SQL Editor → run `supabase/maintenance/staging_verify.sql` (read-only).
Every row should say `OK`. It also prints the Dashboard items it cannot
check from SQL (functions, secrets, auth config — Phase B).

**A5. Seed fictional test data**

SQL Editor → run `supabase/seeds/customer_scenarios.sql`
(idempotent; `supabase/seeds/customer_scenarios_reset.sql` wipes it).
All identities are fictional: `*@lend.test` emails, `5XXXXXXXX` mobiles
in the `551110xxx` range, `10111111xx` national IDs, fixed UUIDs —
**no production data is copied, ever.** The seed now also writes the
`auth.identities` rows Supabase Auth requires for email+password
sign-in (hand-inserted `auth.users` rows alone cannot log in on real
GoTrue). Password for all five accounts: `Lend!2026`.

Sign-in smoke test: from a local dev build pointed at lend-test
(`.env.local` with the lend-test URL + anon key), log in as
`active+customer@lend.test` — this is the one check a local Postgres
replay cannot cover, since only the real project runs GoTrue.

## Phase B — Edge Functions, secrets, Auth config (Dashboard/CLI)

**B1. Deploy the six functions** (config.toml carries the
`verify_jwt = false` flags for merchant-doc-upload, merchant-doc-cleanup
and push-dispatch):

```bash
scripts/supabase-guard.sh staging functions-deploy
```

**B2. Secrets** (Dashboard → Edge Functions → Secrets, or
`supabase secrets set --project-ref <LEND_TEST_REF>`):

| Secret | Staging value |
|--------|---------------|
| `MSEGAT_USERNAME/API_KEY/SENDER_NAME/BASE_URL` | **Leave unset initially** — registration then exercises the fail-closed paths without sending real SMS (and without spending MSEGAT credit). Set real values only when you deliberately test SMS from staging. |
| `APNS_*` (5) / `FCM_SERVICE_ACCOUNT` | Leave unset until push testing matters. For the future **Lend Test** iOS app, `APNS_TOPIC` must be that app's bundle id, not `sa.lend.app`. |
| `TURNSTILE_SECRET` | Unset (CAPTCHA optional) or a Turnstile *test* key. |
| `DOC_UPLOAD_IP_SALT` | Any fresh random string (never reuse production's). |
| `DOC_UPLOAD_MAX_PER_HOUR` | e.g. `20`. |

`SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` are injected by the platform —
never set them by hand.

**B3. Auth configuration** (Dashboard → Authentication):

* URL Configuration → Site URL `https://lendsa.vercel.app`; Redirect
  URLs: `https://lendsa.vercel.app/auth/reset-password`,
  `https://lendsa.vercel.app/merchant/login`,
  `http://localhost:5173/auth/reset-password`,
  `http://localhost:5173/merchant/login`.
* Email: the built-in mailer is fine for staging (low volume, Supabase
  sender). Do NOT reuse the production Resend key unless you want
  staging mail to look exactly like production's.
* Confirm email: match production's setting (ON for the merchant
  signup confirmation flow).

**B4. pg_cron for push-dispatch — skip for now.** Without it, push
jobs just queue in `push_jobs` (inspectable, harmless). Add it per
docs/push-pipeline.md when staging push delivery matters.

## Phase C — Vercel (approval-gated; NOT yet)

On the **staging** Vercel project (lendsa.vercel.app) only: switch
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to lend-test and
redeploy. From that moment staging is fully isolated — and the shared-
Supabase risk paragraph in docs/deployment.md gets updated to say so.
The production Vercel project and its env vars are untouched.

## Phase D — two coexisting iOS apps (plan only; no changes yet)

Goal: **LEND** (production) and **LEND Test** installed side by side on
one iPhone. iOS identity = bundle id, so the test app needs its own:

* **LEND (production)** — bundle id `sa.lend.app`, display name `Lend`,
  built with `.env.production` (lend-staging keys,
  `VITE_APP_ORIGIN=https://app.lend.sa`). Exactly today's app;
  unchanged.
* **LEND Test** — new bundle id (recommended: `sa.lend.test`), display
  name `Lend Test`, built from the SAME code with a `.env.staging`
  file: lend-test URL + anon key, the two OTP provider vars,
  `VITE_DEPLOY_ENV=staging` (the in-app staging badge makes the build
  unmistakable), `VITE_APP_ORIGIN=https://lendsa.vercel.app`.

Implementation when we get there (one PR, reversible): a second Xcode
scheme/build configuration on the existing target with its own
`PRODUCT_BUNDLE_IDENTIFIER`, `CFBundleDisplayName` and app-icon set
(visually distinct icon strongly recommended), plus a
`build:staging` npm script (`vite build --mode staging` picks up
`.env.staging`) feeding `cap sync`. Separate App Store Connect app
record + APNs topic only when the test app needs TestFlight/push.
Nafath/payment simulations stay labeled as such in both.

## Safeguards recap (what protects production from here on)

1. `supabase/environments.json` + `scripts/supabase-guard.sh` — every
   CLI push/deploy verifies the linked project REF; production ref is
   recognized and refused for db-push/functions-deploy.
2. `staging_bootstrap.sql` gate — aborts (and rolls back) on any
   populated database; tested against a simulated-production state.
3. `public.environment_marker` — staging-only scripts can assert
   `env = 'staging'` mechanically; production never has the row.
4. Production migrations remain MANUAL (SQL Editor, reviewed, in
   order) — the guard script refuses to automate them by design.
5. Verification is read-only (`staging_verify.sql`) and includes a
   "no real people in this database" review row.

## Validation already performed (local, no Supabase project touched)

On a fresh local Postgres 16 with Supabase-shape `auth`/`storage`
shims: all 64 migrations replayed in order with zero errors (after the
122300 replay fix) → bootstrap ran, re-ran (idempotent), and correctly
ABORTED on a simulated populated database → verify showed all OK →
seeds applied twice (idempotent) with correct `auth.identities` rows →
reset wiped everything back to zero. Not yet verified anywhere real:
GoTrue sign-in of seeded users, Edge Function behavior, and auth email
flows — those are the Phase A5/B checks on lend-test itself.
