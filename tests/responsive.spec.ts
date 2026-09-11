import { test, expect, type Page } from '@playwright/test';

// =====================================================================
// Responsive smoke tests — layout only, no business logic.
// =====================================================================
// For every key route at every target viewport:
//   1. the page renders (root not empty),
//   2. NO horizontal overflow (document and the app scroller),
//   3. Arabic RTL stays the document default,
//   4. on tablet/desktop the shell canvas is a centered max-width
//      column, never stretched edge-to-edge.
// Runs in demo mode (no Supabase env in the preview build), seeding
// the demo customer session through localStorage so authenticated
// customer surfaces render with the seeded demo data.
// =====================================================================

const VIEWPORTS = [
  { name: 'small-phone', width: 360, height: 740 },
  { name: 'iphone', width: 390, height: 844 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide-desktop', width: 1440, height: 900 },
] as const;

// Expected shell max widths (MobileShell tablet strategy).
function maxShellWidth(viewport: number): number {
  if (viewport >= 1280) return 1080;
  if (viewport >= 1024) return 960;
  if (viewport >= 768) return 720;
  return 440;
}

const PUBLIC_ROUTES = [
  '/welcome',
  '/auth/login',
  '/auth/register',
  '/merchant/welcome',
  '/merchant/login',
];

const CUSTOMER_ROUTES = ['/home', '/stores', '/contracts', '/profile', '/disputes'];

const DEMO_SESSION = {
  fullName: 'عميل تجريبي',
  dob: '1990-01-01',
  mobile: '512345678',
  email: 'demo@example.com',
  city: 'riyadh',
  address: 'الرياض',
  profession: 'employee',
  employer: 'Demo',
  income: '10000',
  nafathVerified: false,
  createdAt: new Date().toISOString(),
};

// Hermetic runs: external resources (Google Fonts etc.) are aborted so
// sandboxed/offline CI never hangs on them — a stylesheet that never
// finishes loading delays DOMContentLoaded and the app bundle itself.
async function blockExternal(page: Page) {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:4173',
    (route) => route.abort(),
  );
}

async function assertResponsive(page: Page, width: number) {
  // Root actually rendered something.
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('#root')?.childElementCount ?? 0))
    .toBeGreaterThan(0);

  // Arabic-first: RTL must remain the document default.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector('main');
    const shell = document.querySelector('#root > div > div') as HTMLElement | null;
    return {
      docOverflow: doc.scrollWidth - doc.clientWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      shellWidth: shell ? shell.getBoundingClientRect().width : 0,
    };
  });

  // No horizontal overflow anywhere (1px tolerance for subpixels).
  expect(metrics.docOverflow, 'document horizontal overflow').toBeLessThanOrEqual(1);
  expect(metrics.mainOverflow, 'app scroller horizontal overflow').toBeLessThanOrEqual(1);

  // Tablet/desktop: centered canvas, never stretched edge-to-edge.
  if (metrics.shellWidth > 0) {
    expect(metrics.shellWidth, 'shell canvas exceeds its max width').toBeLessThanOrEqual(
      maxShellWidth(width) + 1,
    );
  }
}

for (const route of PUBLIC_ROUTES) {
  test(`public ${route} fits all viewports`, async ({ page }) => {
    await blockExternal(page);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // domcontentloaded: don't hang on external resources (fonts)
      // in sandboxed CI — the assertions poll for rendered content.
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await assertResponsive(page, vp.width);
    }
  });
}

for (const route of CUSTOMER_ROUTES) {
  test(`customer ${route} fits all viewports (demo session)`, async ({ page }) => {
    await blockExternal(page);
    await page.addInitScript((session) => {
      window.localStorage.setItem('applux.session', JSON.stringify(session));
    }, DEMO_SESSION);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // domcontentloaded: don't hang on external resources (fonts)
      // in sandboxed CI — the assertions poll for rendered content.
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await assertResponsive(page, vp.width);
    }
  });
}

// =====================================================================
// Confirmation dialog (ConfirmSheet → Sheet) — real-device regression:
// phone = bottom sheet covering the bottom navigation with visible,
// padded actions; tablet/desktop = centered dialog (max ~480px), never
// a bottom sheet. Driven through the demo-mode profile delete-account
// confirmation (same shared component as the dispute claim approval).
// =====================================================================

async function openProfileConfirm(page: Page) {
  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('#root')?.childElementCount ?? 0))
    .toBeGreaterThan(0);
  await page.getByText('حذف الحساب', { exact: true }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
}

function confirmPanel(page: Page) {
  // The focusable panel inside the dialog (overlay button is its sibling).
  return page.locator('[role="dialog"] > div[tabindex="-1"]');
}

test('confirm dialog: phone bottom sheet covers the nav, buttons visible', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  await page.setViewportSize({ width: 390, height: 844 });
  await openProfileConfirm(page);

  const panel = confirmPanel(page);
  const box = (await panel.boundingBox())!;
  // Bottom sheet: anchored to the very bottom edge of the viewport —
  // nothing (bottom nav included) can sit visually below it.
  expect(Math.abs(box.y + box.height - 844)).toBeLessThanOrEqual(1);
  // The action buttons are on-screen and not glued to the bottom edge.
  const confirmBtn = panel.getByRole('button', { name: 'نعم، احذف حسابي' });
  await expect(confirmBtn).toBeVisible();
  const btnBox = (await confirmBtn.boundingBox())!;
  expect(btnBox.y + btnBox.height).toBeLessThanOrEqual(844 - 8);
  // The topmost element over the bottom-nav area belongs to the dialog
  // overlay/panel — the nav can never paint above the modal.
  const navCovered = await page.evaluate(() => {
    const el = document.elementFromPoint(195, 844 - 20);
    return Boolean(el?.closest('[role="dialog"]'));
  });
  expect(navCovered, 'dialog must cover the bottom navigation').toBe(true);
});

test('confirm dialog: tablet/desktop is a centered modal, not a bottom sheet', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  for (const vp of [{ width: 834, height: 1194 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openProfileConfirm(page);
    const box = (await confirmPanel(page).boundingBox())!;
    // Confirmation width: the sm dialog cap (~480px), within 420–520.
    expect(box.width).toBeLessThanOrEqual(480 + 1);
    // Horizontally centered…
    expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThanOrEqual(2);
    // …and floating: clearly detached from the bottom edge.
    expect(vp.height - (box.y + box.height)).toBeGreaterThan(40);
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  }
});

// =====================================================================
// Rentals list navigation (real-device regression): from /contracts,
// "مراجعة" on a pending offer must enter the actual review/approval
// flow — the wizard at /review/<scanToken> when the offer carries a
// token, else the invoice tracking page — and past rentals must open
// contract tracking. Demo seeds cover both pending variants.
// =====================================================================

test('rentals list: pending "مراجعة" opens the review flow; past rows navigate', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contracts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('بانتظار موافقتك')).toBeVisible();

  const reviewRows = page.getByText('مراجعة', { exact: true });
  // Offer WITH a scan token → review wizard (the approval flow).
  const hrefs: (string | null)[] = [];
  for (let i = 0; i < (await reviewRows.count()); i++) {
    hrefs.push(await reviewRows.nth(i).evaluate((el) => el.closest('a')?.getAttribute('href') ?? null));
  }
  expect(hrefs).toContain('/review/RM-88231');
  // Offer WITHOUT a token → invoice tracking fallback, never a dead row.
  expect(hrefs).toContain('/track/invoice/inv-1039');
  for (const h of hrefs) expect(h, 'every pending row navigates').toBeTruthy();

  // The wizard actually loads (no 404/blank) after tapping the row.
  await reviewRows.first().click();
  await expect(page).toHaveURL(/\/review\/RM-88231$/);
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('main')?.innerText.length ?? 0))
    .toBeGreaterThan(50);

  // Fallback target loads too (invoice details, not the not-found state).
  await page.goto('/track/invoice/inv-1039', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('فاتورة تنظيف وتلميع — بشت الأمراء')).toBeVisible();

  // Past rentals are tappable and route to contract tracking.
  await page.goto('/contracts', { waitUntil: 'domcontentloaded' });
  const pastHref = await page
    .getByText('حقيبة أكرا آيكن — حناء')
    .first()
    .evaluate((el) => el.closest('a')?.getAttribute('href'));
  expect(pastHref).toMatch(/^\/track\/contract\//);
});
