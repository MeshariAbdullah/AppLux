import { defineConfig } from '@playwright/test';

// Responsive smoke suite — runs against the Vite DEV server: a
// production build without VITE_SUPABASE_* env shows the
// ProductionConfigGuard screen instead of the app, while the dev
// server runs in demo mode, so the real pages render deterministically
// with seeded demo data and no backend.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    // CI/sandboxes with a system Chromium can point at it instead of
    // downloading a matching browser (npx playwright install).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  webServer: [
    // Full mode (default) — the existing responsive/behavior suite.
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    // Business portal mode — same code, VITE_SITE_MODE=business
    // (tests/site-mode.spec.ts targets this port explicitly).
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: true,
      timeout: 30_000,
      env: { VITE_SITE_MODE: 'business' },
    },
    // Staging-labeled deploy — same code, VITE_DEPLOY_ENV=staging
    // (tests/deploy-env.spec.ts targets this port explicitly).
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: true,
      timeout: 30_000,
      env: { VITE_DEPLOY_ENV: 'staging' },
    },
  ],
});
