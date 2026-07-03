import type { CapacitorConfig } from '@capacitor/cli';

// =====================================================================
// Capacitor 7 configuration for the Lend iOS shell.
// =====================================================================
// `appId` is the Apple bundle identifier and is IMMUTABLE after the
// first TestFlight upload. Do not change without a coordinated app
// re-registration in App Store Connect.
//
// `webDir` is the Vite build output. `npm run build` writes here, and
// `npx cap sync ios` copies the contents into ios/App/App/public/ so
// the WKWebView loads them as a local bundle (not over the network).
//
// We deliberately do NOT set `server.url`. In dev a live-reload URL
// can be useful, but it ships a remote-loader to the App Store, which
// Apple rejects under Guideline 4.7 in most cases. Local dev should
// use `npm run dev` in a browser, not a remote Capacitor URL.
// =====================================================================

const config: CapacitorConfig = {
  appId: 'sa.lend.app',
  appName: 'Lend',
  webDir: 'dist',
  ios: {
    // `contentInset: 'always'` makes WKWebView respect the iOS safe
    // areas (notch / home indicator). Our Tailwind layout already
    // uses env(safe-area-inset-*); this turns those CSS vars on.
    contentInset: 'always',
    // Lock the WebView background to Deep Navy (Lend 2026 brand
    // refresh). Matches the <meta name="theme-color"> in index.html
    // so there is no colour flash between launch, splash, and first
    // React render.
    backgroundColor: '#1B2951',
  },
};

export default config;
