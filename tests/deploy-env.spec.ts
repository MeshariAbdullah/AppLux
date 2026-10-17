import { test, expect, type Page } from '@playwright/test';

// =====================================================================
// Deploy-env labeling — the staging badge shows on a staging-labeled
// deploy (VITE_DEPLOY_ENV=staging, third dev server on 4175) and NEVER
// on the unlabeled full/business servers (4173/4174). The resolver
// matrix itself (native pinning, hostname backstop) lives in
// scripts/site-mode.test.mjs; this verifies the one UI consequence.
// =====================================================================

const FULL = 'http://127.0.0.1:4173';
const BIZ = 'http://127.0.0.1:4174';
const STAGING = 'http://127.0.0.1:4175';

async function blockExternal(page: Page, origin: string) {
  await page.route(
    (url) => url.origin !== origin,
    (route) => route.abort(),
  );
}

async function waitRendered(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('#root')?.childElementCount ?? 0))
    .toBeGreaterThan(0);
}

test('staging deploy shows the badge on every screen', async ({ page }) => {
  await blockExternal(page, STAGING);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ['/welcome', '/auth/login']) {
    await page.goto(`${STAGING}${path}`, { waitUntil: 'domcontentloaded' });
    await waitRendered(page);
    await expect(page.getByTestId('staging-badge')).toBeVisible();
    await expect(page.getByTestId('staging-badge')).toHaveText('بيئة تجريبية');
  }
});

test('production-labeled deploys never show the badge (full and business modes)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await blockExternal(page, FULL);
  await page.goto(`${FULL}/welcome`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  await expect(page.getByTestId('staging-badge')).toHaveCount(0);

  await page.unrouteAll();
  await blockExternal(page, BIZ);
  await page.goto(`${BIZ}/merchant/welcome`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  await expect(page.getByTestId('staging-badge')).toHaveCount(0);
});

test('staging deploy still serves the FULL app (labeling never changes what is served)', async ({ page }) => {
  await blockExternal(page, STAGING);
  await page.setViewportSize({ width: 390, height: 844 });

  // Customer welcome stays the customer welcome (no business-mode gating).
  await page.goto(`${STAGING}/welcome`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  expect(new URL(page.url()).pathname).toBe('/welcome');

  // Merchant entry reachable too.
  await page.goto(`${STAGING}/merchant/welcome`, { waitUntil: 'domcontentloaded' });
  await waitRendered(page);
  expect(new URL(page.url()).pathname).toBe('/merchant/welcome');
});
