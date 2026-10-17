# Lend — web deployment architecture (production / business / staging)

One repository, one codebase, one Vite build — three web surfaces plus
the native apps. What each host serves is decided at runtime/build by
`src/lib/siteMode.ts` (site mode + deploy-env label), consumed only by
`src/routes.tsx`.

| Host                  | Surface                              | Site mode  | Deploy env |
|-----------------------|--------------------------------------|------------|------------|
| `app.lend.sa`         | PRODUCTION app — customer + merchant (+ admin) | `full` (default) | production |
| `business.lend.sa`    | Merchant-only business portal        | `business` (hostname-forced, fail closed) | production |
| `lendsa.vercel.app`   | STAGING / testing                    | `full`     | staging (badge shown) |
| `www.lend.sa`         | Marketing site — **separate repo**, untouched | — | — |
| iOS / Android         | Full app (local `npm run build` + `cap sync`) | `full` (native-pinned) | production (badge never shows) |

Rules recap (unit-tested in `scripts/site-mode.test.mjs`):

* Site mode: native → always `full`; `business.lend.sa` hostname →
  always `business`; `VITE_SITE_MODE=business` → `business`; else
  `full`. The business portal cannot leak customer UI even if its env
  var is forgotten, and no env var can ever strip a role from the
  native binary.
* Deploy env: native → `production`; explicit `VITE_DEPLOY_ENV` wins;
  `lendsa.vercel.app` hostname → `staging` (backstop); else
  `production`. "Staging" only adds the small badge — it never changes
  what is served.

---

## Vercel project layout (recommended, manual setup)

Two Vercel projects, SAME GitHub repository. Vercel domains and env
vars are per-project, and deployments promote per-project — that is
what actually separates production from staging (a custom domain alone
does NOT create an independent environment).

### Project 1 — `lend-app` (NEW: production)

* **Git**: this repository; **Production Branch = `production`** (a
  new long-lived branch; see promotion flow below). Disable deployments
  for other branches on this project (Settings → Git → Ignored Build
  Step or branch filter) so experimental pushes can never ship to
  production.
* **Domains**: `app.lend.sa` (primary) and `business.lend.sa`. One
  project can safely serve both: the hostname rule forces business
  mode on `business.lend.sa` with no per-domain env needed.
* **Environment variables (Production)** — all of:
  * `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the production
    Supabase project.
  * `VITE_REGISTRATION_OTP_PROVIDER=sms-edge`
  * `VITE_RENTER_OTP_PROVIDER=rpc-inapp`
  * `VITE_APP_ORIGIN=https://app.lend.sa`
  * `VITE_PRIVACY_POLICY_URL`, `VITE_TERMS_URL`, `VITE_SUPPORT_URL`,
    `VITE_SUPPORT_EMAIL`
  * Do NOT set: `VITE_SITE_MODE` (hostname handles business),
    `VITE_DEPLOY_ENV`, `VITE_DEMO_MODE`.

### Project 2 — the EXISTING project (becomes staging)

* Keeps `lendsa.vercel.app`. Remove/never add the `lend.sa` domains
  here once Project 1 owns them.
* **Git**: Production Branch = the working branch (today:
  `claude/setup-i18n-rtl-support-soMKY`; later `main`). Every push is
  a staging deploy; previews work as usual.
* **Environment variables**: same shape as production, plus
  `VITE_DEPLOY_ENV=staging`, and `VITE_APP_ORIGIN=https://lendsa.vercel.app`.
* ⚠️ **Backend isolation (reported risk)**: today staging points at
  the SAME Supabase project as production — staging actions touch
  production data (real SMS limits, real accounts). That is a known,
  deliberate state until a second Supabase project exists. If/when a
  staging Supabase project is created, apply the full migration chain
  there, deploy the four Edge Functions, set the MSEGAT secrets (or
  leave unset to exercise the fail-closed paths), and point only this
  project's `VITE_SUPABASE_*` at it. **Until then, treat staging as
  production-data-touching and test accordingly.** Do not call
  staging "isolated" — only the deployments are isolated today.

### Promotion & rollback

* **Promote to production**: merge (or fast-forward) the tested
  commit into the `production` branch and push — only that branch
  deploys Project 1. Nothing deployed to staging ever auto-promotes.
* **Rollback**: Vercel → Project 1 → Deployments → previous deployment
  → "Promote to Production" (instant, no rebuild), and/or
  `git revert` on the `production` branch. Staging rollback is the
  same on Project 2. The projects roll back independently.

---

## DNS (manual, at the lend.sa DNS host)

* `app.lend.sa`      → CNAME `cname.vercel-dns.com` (Vercel shows the
  exact record when the domain is added to Project 1).
* `business.lend.sa` → CNAME `cname.vercel-dns.com` (same project).
* `www.lend.sa`      → unchanged (marketing repo's hosting).
* No DNS change for `lendsa.vercel.app` (Vercel-owned).

## Supabase dashboard (manual; configuration only — no schema change)

Authentication → URL Configuration:

* **Site URL**: `https://app.lend.sa`
* **Redirect URLs** must contain ALL of:
  * `https://app.lend.sa/auth/reset-password`
  * `https://app.lend.sa/merchant/login`        (merchant signup confirmation)
  * `https://business.lend.sa/auth/reset-password`
  * `https://business.lend.sa/merchant/login`
  * `https://lendsa.vercel.app/auth/reset-password`
  * `https://lendsa.vercel.app/merchant/login`
  * `http://localhost:5173/auth/reset-password` (dev, optional)

Everything else (SMTP sender, templates, OTP providers, RLS) is
already configured and unchanged by this task.

## Native builds

`.env.production` for the local iOS/Android build (see
docs/ios-testflight.md): `VITE_APP_ORIGIN=https://app.lend.sa`, the two
OTP provider vars, Supabase production vars, readiness URLs. NEVER set
`VITE_SITE_MODE` or `VITE_DEPLOY_ENV` there — and even if one leaks in,
the native pins (`full`, `production`) neutralize it.

---

## Release plan for app.lend.sa (safe order, nothing disrupted)

1. Create Vercel Project 1 from this repo; set its env vars (above);
   set Production Branch = `production`; create the `production`
   branch from the commit currently serving lendsa.vercel.app.
2. First deploy of Project 1 → verify on its `*.vercel.app` URL
   (full app, no staging badge once `VITE_DEPLOY_ENV` is unset).
3. Add the Supabase redirect URLs (above). Zero impact on existing
   flows — additions only.
4. Add `app.lend.sa` DNS + domain to Project 1 → verify login for a
   customer, a merchant, and an admin account; verify a password
   reset round-trip lands on `https://app.lend.sa/auth/reset-password`.
5. Add `business.lend.sa` DNS + domain to Project 1 → verify it comes
   up merchant-only (customer deep links land on the merchant entry).
6. Flip the EXISTING project to staging: add `VITE_DEPLOY_ENV=staging`
   and redeploy → verify the staging badge shows on
   lendsa.vercel.app and nothing else changed.
7. Next iOS/Android build: update `.env.production`'s
   `VITE_APP_ORIGIN` to `https://app.lend.sa` (no urgency — the old
   value keeps working while lendsa.vercel.app stays allow-listed).

Each step is independently reversible (remove the domain / env var /
redirect URL); the marketing site and native apps are untouched
throughout.
