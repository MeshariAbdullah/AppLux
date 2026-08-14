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
  plugins: {
    PushNotifications: {
      // Show remote alerts even while the app is foregrounded — iOS
      // renders nothing for alert pushes in the foreground otherwise.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    // App-shell fix: `contentInset: 'never'` lets the WKWebView cover
    // the ENTIRE screen (under the status bar and home indicator);
    // the CSS env(safe-area-inset-*) paddings already present on
    // every header/nav then do the safe-area work with the app's own
    // backgrounds. The previous 'always' inset the webview instead,
    // and the exposed native window painted the navy backgroundColor
    // — the "navy strip" above/below the app.
    contentInset: 'never',
    // WebView/window background matches the app canvas so anything
    // momentarily exposed (launch, keyboard transitions) is the same
    // beige as the app surface — never a foreign navy band. Matches
    // <meta name="theme-color"> in index.html.
    backgroundColor: '#F5F5F0',
  },
};

export default config;
