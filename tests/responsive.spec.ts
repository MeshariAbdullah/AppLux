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

// =====================================================================
// Contract tracking hero (real-device regression): the CN-…/LND-…
// reference is a normal labeled value ("رقم العقد"), never the
// oversized headline; status + end-date chips sit on their own row
// clear of the icon block; fee and duration stay visible.
// =====================================================================

test('contract hero: reference is labeled and small, badges clear, facts visible', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  for (const vp of [{ width: 390, height: 844 }, { width: 834, height: 1194 }]) {
    await page.setViewportSize(vp);
    await page.goto('/track/contract/LND-Q7F3KD', { waitUntil: 'domcontentloaded' });

    // The labeled reference: normal size (≤14px), LTR, copyable.
    const ref = page.locator('div.select-all', { hasText: 'LND-Q7F3KD' }).first();
    await expect(ref).toBeVisible();
    const refPx = parseFloat(await ref.evaluate((el) => getComputedStyle(el).fontSize));
    expect(refPx, 'reference is a normal value, not a headline').toBeLessThanOrEqual(14);

    // The hero headline is the ITEM (or merchant), never the reference.
    const title = page.locator('.editorial-title').first();
    expect((await title.textContent())?.trim()).not.toMatch(/^(CN|LND)-/);
    const titlePx = parseFloat(await title.evaluate((el) => getComputedStyle(el).fontSize));
    expect(titlePx).toBeLessThanOrEqual(18);

    // Badges (status + end date) sit ABOVE the icon/title block — no
    // overlap between the chip row and the document icon.
    const endsChip = page.getByText('ينتهي:').first();
    await expect(endsChip).toBeVisible();
    const chipBox = (await endsChip.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(titleBox.y + 1);

    // Fee + duration remain visible in the facts grid.
    await expect(page.getByText('رسم التأجير').first()).toBeVisible();
    await expect(page.getByText('المدة').first()).toBeVisible();
  }
});

// =====================================================================
// Contract documents section: the documented rental contract row is
// present, correctly labeled (platform-generated, never a merchant
// upload), and shows the friendly pending state instead of a dead
// link when the record isn't complete (demo has no live template).
// =====================================================================

test('contract documents: documented-contract row labeled and never a dead link', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  for (const vp of [{ width: 390, height: 844 }, { width: 834, height: 1194 }]) {
    await page.setViewportSize(vp);
    await page.goto('/track/contract/LND-Q7F3KD', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('عقد الإيجار الموثّق').first()).toBeVisible();
    // No live template in demo → the friendly pending copy, not a link.
    await expect(page.getByText('سيظهر العقد بعد اكتمال التوثيق')).toBeVisible();
    // The old ambiguous hint is gone everywhere on the page.
    await expect(page.getByText('اضغط للفتح')).toHaveCount(0);
  }
});

// =====================================================================
// Merchant bottom navigation (real-device regression): rendered by the
// shared MerchantAppLayout as the shell's last row, so it is pinned to
// the canvas bottom on EVERY authenticated merchant page, never
// scrolls with content, and never appears on auth/onboarding pages.
// =====================================================================

const DEMO_MERCHANT = {
  id: 'M-DEMO-1', status: 'approved',
  submittedAt: '2026-09-01T00:00:00Z', approvedAt: '2026-09-01T00:00:00Z',
  rejectedAt: null, rejectionReason: null,
  companyName: 'تاجر ليند', commercialReg: '1010101010',
  authorizedName: 'م', authorizedId: '1', iban: '', city: 'riyadh',
  address: 'x', contactEmail: 'm@e.sa', contactPhone: '0512345678', branches: [],
};

test('merchant nav: fixed on every main page, absent on auth, customer nav intact', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((seed) => {
    window.localStorage.setItem('applux.merchant', JSON.stringify(seed.merchant));
    window.localStorage.setItem('applux.session', JSON.stringify(seed.session));
  }, { merchant: DEMO_MERCHANT, session: DEMO_SESSION });

  for (const vp of [{ width: 390, height: 844 }, { width: 834, height: 1194 }]) {
    await page.setViewportSize(vp);
    for (const route of ['/merchant/home', '/merchant/rentals', '/merchant/damages',
                         '/merchant/session/new', '/merchant/profile']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const nav = page.locator('nav[aria-label="merchant"]');
      await expect(nav, `${route} @${vp.width}`).toBeVisible();
      const shellBottom = await page.evaluate(() => {
        const el = document.querySelector('#root > div > div');
        return el ? el.getBoundingClientRect().bottom : 0;
      });
      const before = (await nav.boundingBox())!;
      // Pinned to the app canvas bottom (= viewport bottom on phones).
      expect(Math.abs(before.y + before.height - shellBottom), `${route} pinned`).toBeLessThanOrEqual(1);
      // Scrolling the content region never moves the nav.
      await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 500));
      const after = (await nav.boundingBox())!;
      expect(Math.abs(after.y - before.y), `${route} stable under scroll`).toBeLessThanOrEqual(1);
      // The scrollable content ends above the nav — nothing hidden.
      const mainBottom = await page.evaluate(
        () => document.querySelector('main')?.getBoundingClientRect().bottom ?? 0,
      );
      expect(mainBottom, `${route} content above nav`).toBeLessThanOrEqual(before.y + 1);
    }
    // Active tab highlighting.
    await page.goto('/merchant/rentals', { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('nav[aria-label="merchant"] a[aria-current="page"]'),
    ).toHaveAttribute('href', '/merchant/rentals');
    // Auth/onboarding pages show no merchant nav.
    await page.goto('/merchant/welcome', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(async () => page.evaluate(() => document.querySelector('#root')?.childElementCount ?? 0))
      .toBeGreaterThan(0);
    await expect(page.locator('nav[aria-label="merchant"]')).toHaveCount(0);
    // Customer nav is untouched.
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav[aria-label="primary"]')).toBeVisible();
  }
});

// =====================================================================
// Pull-to-refresh — the shared Screen gesture on main screens: pulling
// down from the top shows the «اسحب للتحديث» indicator, releasing past
// the threshold runs a refresh cycle (spinner) and closes cleanly.
// Driven with synthetic TouchEvents on the app scroller.
// =====================================================================

async function dragPull(page: Page, from: number, to: number, release = true) {
  await page.evaluate(
    ([startY, endY, doRelease]) => {
      const main = document.querySelector('main');
      if (!main) throw new Error('no main scroller');
      const mk = (clientY: number) =>
        new Touch({ identifier: 1, target: main, clientX: 180, clientY });
      const fire = (type: string, y: number) =>
        main.dispatchEvent(
          new TouchEvent(type, {
            touches: type === 'touchend' ? [] : [mk(y)],
            changedTouches: [mk(y)],
            bubbles: true,
            cancelable: true,
          }),
        );
      fire('touchstart', startY as number);
      // A few intermediate moves like a real finger.
      const steps = 5;
      for (let i = 1; i <= steps; i += 1) {
        fire('touchmove', (startY as number) + (((endY as number) - (startY as number)) * i) / steps);
      }
      if (doRelease) fire('touchend', endY as number);
    },
    [from, to, release] as const,
  );
}

/** Release a gesture held open by dragPull(..., false). */
async function releasePull(page: Page) {
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no main scroller');
    main.dispatchEvent(
      new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }),
    );
  });
}

test('pull-to-refresh: indicator, refresh cycle, and short-pull cancel on Home', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript((session) => {
    window.localStorage.setItem('applux.session', JSON.stringify(session));
  }, DEMO_SESSION);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  const indicator = page.locator('[data-testid="pull-indicator"]');
  await expect(indicator).toHaveAttribute('data-phase', 'idle');

  // Drag far past the threshold, hold: the approved copy is visible.
  await dragPull(page, 200, 520, false);
  await expect(indicator).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByText('اسحب للتحديث')).toBeVisible();

  // Release → refresh cycle → back to idle with the indicator closed.
  await releasePull(page);
  await expect(indicator).toHaveAttribute('data-phase', 'refreshing');
  await expect(indicator).toHaveAttribute('data-phase', 'idle', { timeout: 3000 });
  const transform = await page.evaluate(
    () => (document.querySelector('main > div') as HTMLElement).style.transform,
  );
  expect(transform).toContain('0px');

  // A short pull refreshes nothing.
  await dragPull(page, 200, 240);
  await expect(indicator).toHaveAttribute('data-phase', 'idle');

  // Merchant + admin screens carry the same indicator.
  await page.goto('/merchant/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="pull-indicator"]')).toHaveCount(0);
});
