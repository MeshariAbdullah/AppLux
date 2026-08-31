# Lend — Android / Google Play release guide

The repo now carries a committed Capacitor Android platform (`android/`)
alongside iOS. This document is the single reference for building,
signing, and shipping the Android app, plus the push-notification
architecture that still needs its backend phase.

## Identity & versions

| Item | Value |
|---|---|
| applicationId / namespace | `sa.lend.app` (identical to the iOS bundle id — valid as an Android package, so consistency wins) |
| App name | Lend |
| versionCode / versionName | `1` / `"1.0"` (`android/app/build.gradle`) — bump `versionCode` on EVERY Play upload |
| compileSdk / targetSdk | **36** (Android 16 — current Play requirement) |
| minSdk | 23 (Capacitor 7 floor) |
| AGP / Gradle | 8.9.2 / 8.11.1 wrapper (AGP 8.9+ is the line with official compileSdk 36 support) |
| Java | 21 (Capacitor 7 toolchain) |
| Native code | none of our own — pure WebView + Capacitor plugins, so 64-bit and the 16 KB page-size requirement are satisfied by the toolchain defaults; no NDK concerns |

## Prerequisites (local machine or CI)

* JDK 21, Android SDK with platform 36 + build-tools, `ANDROID_HOME` set
  (Android Studio installs all of this).
* `npm ci` at the repo root.

## Build commands

```bash
# Debug build on a device/emulator (via Android Studio):
npm run android:sync        # vite build + cap sync android
npm run android:open        # opens android/ in Android Studio

# Release App Bundle (.aab):
npm run android:aab         # = android:sync + ./gradlew bundleRelease
# output: android/app/build/outputs/bundle/release/app-release.aab
```

Without signing configured, `bundleRelease` produces an UNSIGNED bundle —
fine for a first Play upload **only** if you enroll in Play App Signing
with a Google-generated key; otherwise sign locally (next section).

## Signing strategy (nothing is ever committed)

`android/.gitignore` blocks `*.jks`, `*.keystore`, and
`google-services.json` — keep it that way.

1. **Enroll in Play App Signing** (default for new apps): Google holds
   the app signing key; you only manage an **upload key**.
2. Create the upload keystore ONCE, locally, and back it up outside the
   repo (password manager + offline copy):
   ```bash
   keytool -genkeypair -v -keystore lend-upload.jks -alias lend-upload \
     -keyalg RSA -keysize 4096 -validity 10000
   ```
3. Point Gradle at it via an untracked `android/keystore.properties`:
   ```properties
   storeFile=/absolute/path/lend-upload.jks
   storePassword=…
   keyAlias=lend-upload
   keyPassword=…
   ```
   and add the standard `signingConfigs.release` block to
   `android/app/build.gradle` reading that file **only if it exists**
   (CI supplies the same four values as secrets and materializes the
   keystore from a base64 secret). Do not hardcode passwords in Gradle.
4. If the upload key is ever lost, Play App Signing lets you rotate it —
   this is why enrolling matters.

## Push notifications — architecture (backend phase still pending)

Current model (KEEP — one source of truth):

```
public.notifications  ──trigger──▶  public.push_jobs  ──▶  push-dispatch edge function  ──▶  platform delivery
```

What exists today:

* `push_device_tokens(user_id, platform, token)` — but the `platform`
  CHECK currently allows **only `'ios'`** (20260502124800).
* `push-dispatch` speaks **APNs only** (`APNS_*` secrets, JWT auth,
  `api.push.apple.com`).
* The client (`src/lib/push/registerPush.ts`) uses the same Capacitor
  plugin on both platforms — it yields an APNs token on iOS and an
  **FCM token on Android** — and now reports the real platform to
  `register_push_token`. Until the backend phase below lands, Android
  registration fails softly against the `'ios'`-only CHECK (logged
  warn; nothing user-visible).

Backend phase — PREPARED in this repo, awaiting your manual Firebase
setup before deploy:

1. **Migration `20260502125200_android_push_tokens.sql`** (unapplied):
   widens the platform CHECK to `('ios','android')`. Safe to apply any
   time — it only permits android rows.
2. **push-dispatch** (updated in repo, redeploy required): branches per
   token platform — APNs path byte-for-byte unchanged; FCM HTTP v1 for
   android tokens (OAuth2 service-account flow via the
   `FCM_SERVICE_ACCOUNT` edge secret, ~50-min token cache). Payload
   parity with iOS: generic `title` + `data.route` only; UNREGISTERED /
   404 revokes the token exactly like APNs 410; same 5-attempt retry
   and per-job logging. Deploying it BEFORE Firebase exists is safe:
   android sends fail with a clear reason, iOS is untouched.
3. **Firebase project (MANUAL — yours)**: create/attach a Firebase
   project → add an Android app with package `sa.lend.app` → download
   `google-services.json` into `android/app/` (git-ignored; Gradle
   auto-applies the google-services plugin only when it exists) →
   Project settings → Service accounts → generate a private key and
   store the FULL JSON as the `FCM_SERVICE_ACCOUNT` edge function
   secret. Nothing Firebase-related is ever committed.
4. Deploy order: migration → Firebase secrets → redeploy
   `push-dispatch` → rebuild the Android app with google-services.json
   present.

**Release gate:** until step 3–4 are done, Android is suitable for
internal/preliminary testing ONLY (everything works except push
delivery + registration). Do not promote past internal testing before
push parity is live.

No other native capability needs Android work: camera/photo capture go
through the web `<input type="file">` → system chooser (no manifest
permission on modern Android), external URLs use `window.open` (Custom
Tabs / browser), OTP + all product flows are pure web, and deep links
are internal SPA routes (no Android App Links registered — matches iOS).

## Permissions (deliberately minimal)

* `INTERNET`
* `POST_NOTIFICATIONS` (Android 13+; runtime prompt via the push plugin)
* Nothing else — no CAMERA, no storage permissions (`allowBackup` is
  also disabled so auth/session data never lands in device backups).

## Google Play Console checklist (manual)

1. **App creation**: Play Console → Create app → name “Lend”, default
   language Arabic, App (not game), Free.
2. **Package name**: fixed forever at first upload — `sa.lend.app`.
3. **App signing**: accept Play App Signing; upload key per the signing
   section above.
4. **First build**: `npm run android:aab` → upload
   `app-release.aab` to **Internal testing** first.
5. **versionCode/versionName**: bump `versionCode` every upload.
6. **App icon / adaptive icon**: DONE in-repo — Lend launcher icons
   (legacy square + round, and adaptive foreground layers on a white
   background color) are generated from the iOS AppIcon source across
   all densities. Play listing still needs the 512×512 PNG (use the
   iOS `AppIcon-512@2x.png` downscaled). The SPLASH screens are still
   Capacitor defaults — replace before a public track if you want a
   branded launch image.
7. **Screenshots**: at least 2 phone screenshots (and 7"/10" tablet
   shots if you enable tablets); **feature graphic** 1024×500.
8. **Privacy policy**: same URL as iOS (`VITE_PRIVACY_POLICY_URL`).
9. **Data safety form**: declare collection of personal info (name,
   phone, email), financial-adjacent rental data, photos (evidence
   uploads), and the contractual National ID; data encrypted in
   transit; account deletion available in-app (App Store parity).
10. **Content rating** questionnaire: utility/business app.
11. **App access**: provide reviewer test credentials (a seeded customer
    + merchant + the OTP note that the customer device shows the code
    in-app).
12. **Target audience**: 18+.
13. **Store listing**: Arabic-first title/description matching the iOS
    listing.
14. **Testing tracks**: Internal → (new personal accounts: 12 testers /
    14 days closed-testing requirement before production; org accounts
    skip this) → Production.
15. Before production: confirm the FCM backend phase is deployed so
    Android users actually receive pushes.

## iPad note (companion change in this branch)

The iOS target is Universal (`TARGETED_DEVICE_FAMILY = "1,2"` declared
at target AND project level, all four iPad orientations, no
`UIRequiresFullScreen`, storyboard launch screen).

**Build number:** the repo keeps `CURRENT_PROJECT_VERSION = 2` and the
repo CANNOT know the latest App Store Connect build number. Before
archiving, check App Store Connect → TestFlight → highest build number
ever uploaded, and set CURRENT_PROJECT_VERSION (Xcode → App target →
Build, or `cd ios/App && xcrun agvtool new-version -all <N>`) to that
number + 1. Never archive with a number ≤ an uploaded build.
