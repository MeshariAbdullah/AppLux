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

Required backend phase (deliberately NOT implemented yet — approve it
as its own change):

1. **New migration** (never touch applied ones): widen the CHECK to
   `platform in ('ios','android')`.
2. **push-dispatch**: branch on `push_device_tokens.platform` — keep the
   APNs path as-is; add an FCM HTTP v1 sender for `'android'` tokens
   (OAuth2 via a Firebase **service-account JSON** stored as an edge
   function secret, e.g. `FCM_SERVICE_ACCOUNT`; project id from it).
   Same payload contract: `title` + `data.route` for tap routing —
   the client's route whitelist already handles taps identically.
3. **Firebase project (manual)**: create/attach a Firebase project, add
   an Android app with package `sa.lend.app`, download
   `google-services.json` into `android/app/` (untracked — the Gradle
   template auto-applies the google-services plugin only when the file
   exists), and store the service-account JSON as the edge secret.
4. Redeploy `push-dispatch` after (2).

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
6. **App icon / adaptive icon**: the scaffold ships Capacitor's default
   launcher icons — replace `android/app/src/main/res/mipmap-*` with
   Lend-branded adaptive icons (foreground + background layers, 108dp
   safe zone) before any public track. Play listing also needs a
   512×512 icon PNG.
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

The iOS target is Universal (`TARGETED_DEVICE_FAMILY = "1,2"` now
declared at target AND project level, all four iPad orientations, no
`UIRequiresFullScreen`, storyboard launch screen, build number bumped
to 3). If a TestFlight build still opens as a scaled iPhone window on
iPad, the archive was made from stale local project state — verify in
Xcode under App target → General → Supported Destinations that iPad is
listed, then re-archive.
