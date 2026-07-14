# Lend — Release Checklist

Practical, executable checklist for cutting a release: Vercel (web) today,
plus the eventual **single TestFlight upload** (iOS section at the end).
Work through it top to bottom; every box should be checkable without
guesswork. Commands assume the repo root on a machine with Node 20+.

Related docs: `docs/ios-testflight.md` (full iOS walkthrough).

---

## 1. Code

- [ ] `git status` is clean — no uncommitted or untracked files.
- [ ] On the release branch/commit you intend to ship: `git log -1 --oneline`
      matches the commit approved for release.
- [ ] `package.json` version is correct for this release (it feeds the
      release line shown on the crash screen and `/diagnostics`).
- [ ] TypeScript + production build pass:
      ```sh
      npm run build        # runs tsc -b && vite build
      ```
- [ ] Bundle shape sane (from build output): vendor-react / vendor-supabase /
      app-shared / pages-admin / pages-merchant / pages-customer-flows /
      Diagnostics chunks present; no chunk unexpectedly ballooned past the
      600 KB warning limit.
- [ ] Capacitor web assets sync cleanly:
      ```sh
      npx cap sync ios
      ```
- [ ] **Feature flags reviewed** — `src/lib/featureFlags.ts`:
      `ENABLE_PAYMENTS_AND_NOTES` must be `false` for the current-phase
      journey (no payment / promissory-note / Nafath UI).
- [ ] **Release metadata reviewed** — on Vercel, `VERCEL_GIT_COMMIT_SHA` /
      `VERCEL_ENV` are injected automatically; confirm the deployed
      `/diagnostics` page shows the expected version · SHA · environment.
- [ ] **No demo mode in production** — `VITE_DEMO_MODE` unset (or `false`)
      in the Vercel Production environment. A prod build without Supabase
      env must render the configuration-error screen, not the demo.
- [ ] **No raw debug logging** — the only direct console calls are the two
      static bootstrap diagnostics in `src/lib/supabase/client.ts` and the
      Phase 6A logger's own sanitized emit. Spot-check:
      ```sh
      grep -rn "console\.\(log\|error\|warn\|info\)" src --include='*.ts*' \
        | grep -v observability/log.ts | grep -v '^\S*: *//'
      ```
- [ ] **Translations reviewed** — `src/locales/ar.json` and `en.json` have
      no missing keys for new screens (dev console warns on missing keys
      while navigating; the automated suites below exercise the main
      Arabic surfaces).

## 2. Migrations / backend

- [ ] All files in `supabase/migrations/` are applied to the **correct**
      Supabase project (Dashboard → Database → Migrations, or
      `supabase migration list` when using the CLI), in filename order.
- [ ] Verify `activate_rental_without_payment_and_note` exists and is the
      activation path (migration `20260502122400…`): SECURITY DEFINER,
      idempotent re-run, errcodes P0090–P0093, hold =
      `original_item_value`.
- [ ] RPC permissions reviewed: EXECUTE grants for `authenticated` only on
      user-facing RPCs; no accidental `anon` grants on privileged
      functions.
- [ ] RLS reviewed: policies still enabled on all user tables (profiles,
      rental_invoices, rental_contracts, promissory_notes, damage cases,
      eligibility) — no table left `rls disabled` after migrations.
- [ ] **Current-phase path creates no payment / note / Nafath records**:
      accepting + activating a test rental must not insert into payment or
      promissory-note tables (they are only touched by the flag-gated
      legacy path).
- [ ] Legacy D1/D2 defects documented and unreconciled data understood
      (see the D1/D2 read-only assessment doc) — remediation runs only
      with separate approval.
- [ ] Rollback notes for any NEW migration in this release are written
      (what to drop/revert, and whether data written in between must be
      preserved).

## 3. Functional pass (on the Vercel preview for the release SHA)

- [ ] Merchant signs in → starts a rental session → issues offer/contract.
- [ ] Customer opens the review link → walks offer → contract → confirm.
- [ ] Contract parties show real names (المؤجّر = merchant, المستأجر =
      customer) — never «—».
- [ ] No payment / promissory-note / Nafath wording anywhere in the flow.
- [ ] Approval activates the rental (single accept + single activation;
      a failed activation shows the explicit retry action with an LND-
      support id).
- [ ] Four-stage journey renders correctly: إصدار العرض والعقد → مراجعة
      العميل → بدء الإيجار → الإرجاع وإنهاء العقد.
- [ ] Merchant closes the rental; closure state reflects immediately
      (details + lists).
- [ ] Damage / non-return case can be opened and closes the rental.
- [ ] Account deletion request works from Profile (and is reversible via
      its cancel banner).
- [ ] Sign-out clears back to Welcome; deep links to guarded routes
      bounce correctly.
- [ ] Idle timeout warning modal appears and signs out; absolute timeout
      signs out (shorten the policy locally if you need to observe it).
- [ ] Offline banner appears/disappears with connectivity; failed actions
      show translated errors (with LND- ids on technical failures only).
- [ ] Arabic and English both render (RTL/LTR, dates, currency).
- [ ] Lazy routes load (first visit to merchant/admin/customer-flow areas
      fetches exactly one pages-* chunk; `/diagnostics` loads its own
      chunk).
- [ ] Stale-deploy behavior: an old tab from the previous deploy recovers
      via the one-shot chunk reload instead of a blank screen.

## 4. Automated suites (all must pass)

Harnesses live in the session scratchpad during development; keep copies
with the release engineer. Each starts its own expectations — the servers
they need are listed here.

| Suite | Serves | Command |
| --- | --- | --- |
| Node scrub tests (6A) | — | `node scrub-test.mjs` |
| Cache primitive test (3A) | — | `node cache-test.mjs` |
| Demo smoke | `npx vite --port 5199` (no env) | `node smoke.mjs` |
| Journey harness | `VITE_SUPABASE_URL=https://fake.lend.test VITE_SUPABASE_ANON_KEY=fake npx vite --port 5299` | `node journey-check.mjs` |
| Phase 4A cache harness | same 5299 server | `node cache-4a-check.mjs` |
| Phase 5 lazy-route suite | fake-env `npm run build` + `npx vite preview --port 4300` | `node lazy-5b-check.mjs` |
| Phase 6A observability harness | fake-env dev server on 5399 | `node obs-check.mjs` |
| Phase 6C diagnostics harness | same 5399 server | `node diag-check.mjs` |

Plus the build itself: `npm run build` (env-less) and `npx cap sync ios`.

## 5. Vercel

- [ ] Preview deployment for the release SHA: run the functional pass
      (§3) against the preview URL.
- [ ] Environment variables reviewed for **Production**:
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
      `VITE_PRIVACY_POLICY_URL`, `VITE_SUPPORT_URL`, `VITE_SUPPORT_EMAIL`;
      `VITE_DEMO_MODE` absent.
- [ ] Promote to Production; smoke the production URL (login, one review
      link, one merchant dashboard load).
- [ ] Old-tab stale-deploy test: keep a tab open from the previous
      production deploy, deploy the new one, navigate in the old tab —
      the chunk-reload guard must recover it.
- [ ] `/diagnostics` on production shows the release SHA you shipped
      (this is the release-confirmation step).

## 6. iOS / TestFlight (when the single upload happens)

Full walkthrough: `docs/ios-testflight.md`. Summary:

- [ ] `git pull` the exact release SHA on the macOS build machine.
- [ ] `npm ci`
- [ ] `npm run build` (with production `VITE_*` env in `.env.local`).
- [ ] `npx cap sync ios`
- [ ] `npx cap open ios` (Xcode).
- [ ] App version (CFBundleShortVersionString) matches `package.json`.
- [ ] **Increment the build number** (CFBundleVersion) — never reuse one.
- [ ] App icon + launch screen render on a simulator.
- [ ] Privacy usage descriptions present for every capability the app
      touches (camera for QR scan, etc.).
- [ ] Product → Archive (Any iOS Device).
- [ ] Distribute → App Store Connect → Upload.
- [ ] Add the build to the **internal** TestFlight group only.
- [ ] Smoke on a physical device: sign-in, review link, journey strip,
      offline banner, sign-out, `/diagnostics` release line.
- [ ] Note the previous good build number in the release notes — that is
      the TestFlight rollback target.

## 7. Rollback

- [ ] **Vercel**: Deployments → previous production deployment →
      "Promote to Production" (instant rollback; no rebuild).
- [ ] **Feature flag**: re-enabling legacy payment UI is a code change
      (`ENABLE_PAYMENTS_AND_NOTES`) — flag rollback = revert the commit
      that flipped it and redeploy; there is no runtime toggle.
- [ ] **Migrations**: forward-only by default. For a bad new migration,
      apply its documented down-steps from the rollback notes (§2); never
      drop tables/columns holding user data without a verified backup
      (Supabase Dashboard → Database → Backups / PITR).
- [ ] **Previous stable reference**: record the last known-good pair —
      git SHA (web) and TestFlight build number (iOS) — in the release
      notes before promoting anything.
