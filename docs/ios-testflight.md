# iOS TestFlight — build & upload guide

This is the engineer-facing runbook for taking a commit on the
default branch and pushing a build to TestFlight. It does **not**
cover full App Store Review; that's gated by the items in the
"Before App Store Review" section at the bottom of this file.

> **Important**: do not change the rental, contract, payment,
> Nafath, Nafith, or promissory note flows while you're packaging
> for iOS. The Capacitor layer is a transparent wrapper — same web
> bundle runs in a `WKWebView`.

---

## 0. What you need before you start

- **macOS 14+** with **Xcode 15+**, CocoaPods (`brew install cocoapods`), and Node 18+.
- **Apple Developer Program** seat, agreement signed, team selected.
- **App Store Connect** app record for bundle id `sa.lend.app`.
- **D-U-N-S number** on file for the legal entity (Apple verifies
  this for org accounts — 1–3 weeks lead time first time round).
- A **distribution certificate** for your team (Xcode auto-manages
  this when you tick "Automatically manage signing").
- A working **App Icon set** and **Launch Screen** in
  `ios/App/App/Assets.xcassets` (see §4 below).
- Production **env file** values for the keys listed in §3.

---

## 1. Install dependencies

These are already declared in `package.json`. On macOS:

```bash
npm install
```

Confirm Capacitor is on the right major:

```bash
npx cap --version       # → 7.x
```

---

## 2. Build the web bundle

The iOS shell loads `dist/` as a local bundle. Vite inlines
`import.meta.env.VITE_*` at build time, so the env file must be in
place **before** `npm run build`.

```bash
npm run build           # → tsc -b && vite build → dist/
```

Sanity-check that production env actually inlined:

```bash
grep -l SUPABASE_URL dist/assets/*.js | head -1
```

If you see no hit, your `.env.production` was wrong / missing.
**Stop, fix, rebuild.** A wrong build = wrong endpoints baked into
the iOS bundle; the only way to fix that is a new TestFlight
upload.

---

## 3. Required production env variables

Create `.env.production` at the repo root (it's `.gitignore`d).
**Every variable below is required for a production iOS build.**

```dotenv
# Supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY

# Demo mode MUST be unset (or "false") for production builds.
# Phase 9 production safety: with this on, seeded demo data would
# appear inside the live app and the build would be rejected.
# VITE_DEMO_MODE=     ← leave commented / unset

# App Store readiness — Profile tab Privacy + Support rows.
# Apple Guideline 5.1.1 requires the privacy policy URL.
VITE_PRIVACY_POLICY_URL=https://lend.sa/privacy
VITE_SUPPORT_URL=https://lend.sa/support
VITE_SUPPORT_EMAIL=support@lend.sa
```

Verify the three readiness checks before you proceed:

1. **`VITE_DEMO_MODE` empty** → the StoreProvider returns empty
   arrays in live mode; no seeded data leaks into the build.
2. **Privacy URL responds 200** at the URL you set.
3. **Support URL / email resolve** in a real browser / mail client.

---

## 4. Generate the iOS shell (one-off)

The first time only, on macOS:

```bash
npx cap add ios
cd ios/App && pod install && cd ../..
```

This creates `ios/App/App.xcworkspace` and a default Xcode
project. **Commit the entire `ios/` folder** (except the
gitignored sub-paths — `Pods/`, `DerivedData/`, `*.xcuserstate`
are excluded by the project `.gitignore`).

### Assets to author before the first build

These don't exist in the repo yet; the build will fail signing
without them.

| Asset | Where | Spec |
| --- | --- | --- |
| App icon (1024×1024 master) | `ios/App/App/Assets.xcassets/AppIcon.appiconset` | PNG, no alpha, no rounded corners — iOS draws the squircle |
| Launch screen | `ios/App/App/Base.lproj/LaunchScreen.storyboard` | Brand background `#0D1224`, centred Lend mark |

> Use [Bakery](https://apps.apple.com/app/bakery/id1575220747) or
> Xcode's bundled "App Icon" generator to expand the 1024 master
> to the full size set.

### Project settings in Xcode (one-off)

Open `ios/App/App.xcworkspace`. Select the `App` target:

- **General → Identity**
  - Display Name: `Lend`
  - Bundle Identifier: `sa.lend.app` (must match `capacitor.config.ts`)
  - Version: matches `package.json` (`0.1.0` today)
  - Build: increment on every TestFlight upload
- **General → Deployment Info**
  - iOS Deployment Target: `14.0`
  - Devices: iPhone only (or Universal if iPad is in scope)
  - Device Orientation: Portrait only (UI is portrait-locked)
- **Signing & Capabilities**
  - Team: your Apple Developer team
  - Automatically manage signing: ON
- **Info → Custom iOS Target Properties**
  - `CFBundleDisplayName`: `Lend`
  - Default `NSAppTransportSecurity` is fine — Supabase is HTTPS.

---

## 5. Sync the web bundle into iOS

Every build cycle, after editing React code:

```bash
npm run ios:sync        # = npm run build && npx cap sync ios
```

`cap sync` copies `dist/` → `ios/App/App/public/` and reinstalls
any added native plugins (none today).

---

## 6. Open in Xcode

```bash
npm run ios:open        # = npx cap open ios
```

If `cap` prompts to choose a workspace, pick
`ios/App/App.xcworkspace`.

---

## 7. Archive & upload to TestFlight

In Xcode:

1. **Product → Destination → "Any iOS Device (arm64)"**.
   Archiving against a simulator destination won't produce an
   uploadable build.
2. **Product → Archive**. Wait for the build to finish.
3. The **Organizer** window opens automatically when the archive
   succeeds. If not, **Window → Organizer**.
4. Select the new archive → **Distribute App**.
5. Choose **App Store Connect** → **Upload** → **Next**.
6. Accept all the defaults (auto-manage signing, include bitcode
   = no, strip swift symbols = yes, upload symbols = yes).
7. Apple processes the build (5–30 minutes). You'll get an email
   when it's ready, or watch in App Store Connect → TestFlight.

---

## 8. TestFlight checklist (every release)

Before adding testers, confirm in App Store Connect → TestFlight:

- [ ] Build state is **Ready to Submit** (no missing compliance).
- [ ] **Export Compliance** answered ("Does your app use
      encryption?" — Lend uses standard HTTPS, answer YES, then
      "Does it qualify for exemption?" — YES, then upload the
      ATS exemption is unnecessary because we only use Supabase
      HTTPS). Apple changes the wording every year — read the
      prompts carefully.
- [ ] **What to Test** filled in with:
      - Contract National ID entry in the merchant flow (10 digits,
        starts with 1 or 2) — signup has NO National ID field
      - Mobile format (5XXXXXXXX, +966 country code)
      - A note that payment + Nafath are **simulated** in this
        build, with labels "SIMULATION — TESTING ONLY" inside the
        app.
- [ ] **Beta App Information**:
      - Privacy Policy URL (same as `VITE_PRIVACY_POLICY_URL`)
      - Feedback Email (same as `VITE_SUPPORT_EMAIL`)
      - Marketing URL (optional)
- [ ] **Internal testers** group: add the 3 test accounts from
      the App Store readiness report — customer, merchant, admin.
- [ ] **External testers** (only if needed): create a group, add
      testers, submit for Beta App Review. Plan ~24h for the
      first build; subsequent builds in the same group skip
      review unless you change the binary's user-facing copy.

---

## 9. Common gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| App opens to a white screen | `dist/` was empty or `webDir` wrong | Re-run `npm run ios:sync`; check `capacitor.config.ts` |
| Supabase calls fail with `URL undefined` | Built without `.env.production` | Create the file, rebuild, re-sync |
| Reviewer can't sign in | Test accounts in dev project, not prod | Create test accounts in the prod Supabase project |
| Build rejected for missing icon | No 1024×1024 master | Add `Assets.xcassets/AppIcon.appiconset` |
| "Bundle ID already in use" | First-time clash with another app on the account | Pick a different bundle id BEFORE first upload; `appId` is immutable per Capacitor docs after first upload |
| Layout cut off at the top | `contentInset` wrong | We set `contentInset: 'always'` in `capacitor.config.ts`; verify it survived `cap sync` |

---

## 10. Do NOT do these things

- **Do NOT submit to App Store Review yet.** TestFlight only.
  Several items remain open (see §11).
- **Do NOT set `server.url`** in `capacitor.config.ts` for
  production. Apple rejects remote-loaded apps under Guideline
  4.7 unless you meet narrow exceptions. The local-bundle path
  is correct.
- **Do NOT change the rental / contract / payment / Nafath /
  Nafith / promissory note flows** to "make it work on iOS".
  The web bundle works in WKWebView unmodified. If something
  doesn't work, it's a Capacitor wrapper issue, not a flow
  issue.

---

## 11. Before App Store Review (NOT TestFlight)

The items below are explicitly **out of scope for TestFlight** but
**must** be closed before the public App Store release:

1. **Wire a real payment processor.** `PaymentSimulationSheet`
   labeled "SIMULATION — TESTING ONLY" is acceptable for
   TestFlight but not for the public store.
2. **Wire real Nafath.** The current Nafath ceremony is also a
   simulation.
3. **Build the soft-deletion finaliser cron.** The 30-day grace
   window from `request_account_deletion()` needs a back-office
   job that actually hard-deletes after the window.
4. **Replace the admin dashboard zeros** with real Supabase
   queries (or hide the dashboard in PROD until then).
5. **Populate App Privacy declarations** in App Store Connect
   matching the inventory in the App Store readiness report.
6. **Verify SAMA compliance** (Saudi Central Bank). If Lend
   handles financial transactions the legal team must confirm
   licensing before public launch.
7. **Add crash reporting** (Sentry or Apple's built-in).

When the items above are closed, re-read the App Store readiness
report (commit `1e9a2e1`) and the Phase 9 demo-data cleanup
commits before submitting the public release.
