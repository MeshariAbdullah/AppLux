import { test, expect, type Page } from '@playwright/test';

// =====================================================================
// Business portal mode (VITE_SITE_MODE=business) — dual-mode routing
// enforcement. Runs against the SECOND dev server (port 4174, business
// mode); the existing responsive suite on 4173 is the "full mode keeps
// current customer + merchant behavior" half of the dual-mode pair.
//
// Demo mode note: the dev server has no Supabase env, so RootRedirect
// takes the !configured branch — in business mode that is always the
// merchant entry. The authenticated non-merchant "portal only" screen
// requires a live session and is covered structurally by
// scripts/site-mode.test.mjs.
// =====================================================================

const BIZ = 'http://127.0.0.1:4174';

const DEMO_SESSION = {
  fullName: 'عميل تجريبي', dob: '1990-01-01', mobile: '512345678',
  email: 'demo@example.com', city: 'riyadh', address: 'الرياض',
  profession: 'employee', employer: 'Demo', income: '10000',
  nafathVerified: false, createdAt: new Date().toISOString(),
};

const DEMO_MERCHANT = {
  id: 'M-DEMO-1', status: 'approved',
  submittedAt: '2026-09-01T00:00:00Z', approvedAt: '2026-09-01T00:00:00Z',
  rejectedAt: null, rejectionReason: null,
  companyName: 'تاجر ليند', commercialReg: '1010101010',
  authorizedName: 'م', authorizedId: '1', iban: '', city: 'riyadh',
  address: 'x', contactEmail: 'm@e.sa', contactPhone: '0512345678', branches: [],
};

async function blockExternal(page: Page) {
  await page.route(
    (url) => url.origin !== BIZ,
    (route) => route.abort(),
  );
}

async function waitRendered(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('#root')?.childElementCount ?? 0))
    .toBeGreaterThan(0);
}

test('business mode: root and every customer/admin deep link land on the merchant entry', async ({ page }) => {
  await blockExternal(page);
  // Even WITH a seeded demo customer session: business mode never
  // routes into customer surfaces.
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of [
    '/', '/home', '/stores', '/contracts', '/notifications', '/profile',
    '/disputes', '/track/contract/LND-Q7F3KD', '/review/RM-88231',
    '/admin/home', '/admin/cases', '/admin/users',
    '/welcome', '/auth/login',
  ]) {
    await page.goto(`${BIZ}${path}`, { waitUntil: 'domcontentloaded' });
    await waitRendered(page);
    await expect
      .poll(async () => new URL(page.url()).pathname, { timeout: 10_000 })
      .toMatch(/^\/merchant\/(welcome|login)$/);
    // The customer shell never mounts.
    await expect(page.locator('nav[aria-label="primary"]')).toHaveCount(0);
  }
});

test('business mode: merchant flows work end to end (demo merchant)', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((seed) => {
    window.localStorage.setItem('applux.session', JSON.stringify(seed.session));
    window.localStorage.setItem('applux.merchant', JSON.stringify(seed.merchant));
  }, { session: DEMO_SESSION, merchant: DEMO_MERCHANT });
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const path of ['/merchant/home', '/merchant/rentals', '/merchant/damages', '/merchant/profile']) {
    await page.goto(`${BIZ}${path}`, { waitUntil: 'domcontentloaded' });
    await waitRendered(page);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.locator('nav[aria-label="merchant"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="primary"]')).toHaveCount(0);
  }
});

test('business mode: shared password-recovery routes stay reachable', async ({ page }) => {
  await blockExternal(page);
  await page.setViewportSize({ width: 390, height: 844 });

  // Forgot password renders its own form (no redirect away).
  await page.goto(`${BIZ}/auth/forgot-password`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  expect(new URL(page.url()).pathname).toBe('/auth/forgot-password');
  await expect(page.getByText('إعادة تعيين كلمة المرور').first()).toBeVisible();

  // Reset password renders (invalid-link state without a token — the
  // page itself, not a redirect to the merchant entry).
  await page.goto(`${BIZ}/auth/reset-password`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  expect(new URL(page.url()).pathname).toBe('/auth/reset-password');

  // The customer sign-in path redirects to the MERCHANT login, so the
  // shared pages' "back to sign in" links land correctly.
  await page.goto(`${BIZ}/auth/login`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  await expect
    .poll(async () => new URL(page.url()).pathname)
    .toBe('/merchant/login');
});
