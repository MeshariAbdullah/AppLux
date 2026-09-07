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
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
