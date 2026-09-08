// =====================================================================
// Lend — App Store screenshot generator (Arabic set).
// =====================================================================
// End to end: boots the app (expects the Vite dev server on
// APP_URL, default http://127.0.0.1:4173, in DEMO mode), captures the
// five approved REAL screens at iPhone-16-Pro-Max logical size
// (440×956 @3x = 1320×2868), then composes each into the marketing
// canvas via template.html and emits both App Store Connect sizes:
//
//   appstore/ar/NN-lend-appstore-ar.png      1320×2868  (6.9" slot)
//   appstore/ar/NN-lend-appstore-ar-65.png   1284×2778  (6.5" slot)
//
// Regenerate:   npm run dev  (in another shell)   then
//               node appstore/render.mjs
// English set later: add a SHOTS entry set with locale 'en' and the
// English copy — template + pipeline are locale-aware.
//
// Brand fonts are served locally from appstore/fonts (also injected
// into the app pages, replacing the Google Fonts request, so captures
// use the production typefaces without network). All demo data is
// fictional (seeded demo store).
// =====================================================================
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const CAPTURE_DIR = process.env.CAPTURE_DIR || path.join(DIR, '.captures');
const OUT = path.join(DIR, 'ar');

// Fictional demo identities (customer session + approved merchant),
// stored in the demo store's own localStorage format.
const SESSION = {
  fullName: 'سارة العتيبي', dob: '1994-03-01', mobile: '512345678',
  email: 'sara@example.com', city: 'riyadh', address: 'الرياض، حي الياسمين',
  profession: 'employee', employer: 'شركة الأفق', income: '14000',
  nafathVerified: false, createdAt: '2026-04-01T09:00:00.000Z',
};
const MERCHANT = {
  id: 'm-demo-1', status: 'approved',
  companyName: 'ميزون دو سواريه', commercialReg: '1010456789',
  authorizedName: 'مشاعل القحطاني', authorizedId: '', iban: '',
  city: 'riyadh', address: 'الرياض — بوليفارد لكجري',
  contactEmail: 'hello@maison.example', contactPhone: '0550000000',
  branches: [], submittedAt: '2026-03-01T09:00:00.000Z',
  approvedAt: '2026-03-05T09:00:00.000Z', rejectedAt: null, rejectionReason: null,
};

// ---------------------------------------------------------------------
// The approved 5-shot plan (copy + real source screens).
// ---------------------------------------------------------------------
const SHOTS = [
  {
    n: '01', locale: 'ar', bg: 'navy', lockup: true, statusBg: '#F5F5F0',
    headline: [[{ t: 'استأجر بثقة.' }], [{ t: 'ووثّق حقك.', green: true }]],
    sub: 'إيجارات موثّقة من متاجر موثّقة',
    source: '/home — src/pages/Home.tsx (pending-offer dashboard)',
    capture: async (page) => {
      await page.goto(`${APP}/home`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
    },
  },
  {
    n: '02', locale: 'ar', bg: 'beige', statusBg: '#FBFBF7',
    headline: [[{ t: 'راجع العرض والعقد' }, { t: 'بوضوح', green: true }]],
    sub: 'كل التفاصيل قبل ما توافق',
    source: '/review/RM-88231 step العرض — src/pages/Review.tsx',
    capture: async (page) => {
      await page.goto(`${APP}/review/RM-88231`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
    },
  },
  {
    n: '03', locale: 'ar', bg: 'navy', statusBg: '#FBFBF7',
    headline: [[{ t: 'وافق' }, { t: 'من التطبيق', green: true }]],
    sub: 'كل خطوة موثّقة',
    source: '/review/RM-88231 step التأكيد — src/pages/Review.tsx',
    capture: async (page) => {
      await page.goto(`${APP}/review/RM-88231`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      // Real flow: العرض → العقد → التأكيد, then tick the three
      // acknowledgement rows (custom <button> toggles — the approval
      // CTA arms). Never submits the approval itself.
      await page.getByRole('button', { name: 'متابعة' }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'متابعة' }).click();
      await page.waitForTimeout(500);
      for (const label of ['اطلعت', 'الالتزامات المالية', 'تفعيل الإيجار']) {
        await page.locator('button', { hasText: label }).first().click();
        await page.waitForTimeout(150);
      }
      // Clicking auto-scrolls; the whole step fits — back to the top
      // so no text sits clipped at the fold.
      await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
      await page.waitForTimeout(400);
    },
  },
  {
    n: '04', locale: 'ar', bg: 'beige', statusBg: '#FBFBF7',
    headline: [[{ t: 'تابع إيجارك' }, { t: 'من مكان واحد', green: true }]],
    sub: 'المواعيد والحالة والعقد',
    source: '/track/contract/LND-Q7F3KD — src/pages/ContractTracking.tsx (رحلة الإيجار + السجل الموثّق)',
    capture: async (page) => {
      await page.goto(`${APP}/track/contract/LND-Q7F3KD`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      // Scroll the app scroller so the journey timeline leads the
      // frame (the hero card clamps long titles — kept out of shot).
      await page.evaluate(() => {
        const main = document.querySelector('main');
        const label = [...main.querySelectorAll('*')]
          .find((e) => e.childElementCount === 0 && e.textContent.trim() === 'رحلة الإيجار');
        const card = label.closest('main > * > *') ?? label;
        // The hero card clamps long titles (ellipsis) — keep it fully
        // above the fold so the timeline leads the frame. The record
        // card's optional-value rows render «—» in demo data; that is
        // the app's real empty state, preferred over showing the
        // clamped title.
        main.scrollTo(0, card.getBoundingClientRect().top
          - main.getBoundingClientRect().top + main.scrollTop - 14);
      });
      await page.waitForTimeout(500);
    },
  },
  {
    n: '05', locale: 'ar', bg: 'navy', statusBg: '#F5F5F0',
    headline: [[{ t: 'للمتاجر: إيجارات منظّمة' }, { t: 'وموثّقة', green: true }]],
    sub: 'عقود رقمية لعملائك بدون ورق',
    source: '/merchant/home — src/pages/merchant/MerchantHome.tsx',
    capture: async (page) => {
      await page.goto(`${APP}/merchant/home`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
    },
  },
];

// ---------------------------------------------------------------------
// Local font service — used for BOTH the app capture (replacing the
// Google Fonts request) and the composition page.
// ---------------------------------------------------------------------
function fontCss() {
  let css = '';
  for (const w of [400, 500, 600, 700]) {
    css += `@font-face{font-family:'IBM Plex Sans Arabic';font-style:normal;font-weight:${w};src:url(https://fonts.gstatic.com/local/plex-${w}.woff2) format('woff2');}\n`;
    css += `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};src:url(https://fonts.gstatic.com/local/inter-${w}.woff2) format('woff2');}\n`;
  }
  return css;
}
async function routeAppFonts(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ contentType: 'text/css', body: fontCss() }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const m = r.request().url().match(/local\/(plex|inter)-(\d+)\.woff2/);
    if (!m) return r.abort();
    const file = m[1] === 'plex'
      ? path.join(DIR, 'fonts', `plex-arabic-${m[2]}.woff2`)
      : path.join(DIR, 'fonts', `inter-${m[2]}.woff2`);
    return r.fulfill({ contentType: 'font/woff2', body: readFileSync(file) });
  });
  await ctx.route((u) =>
    !u.href.startsWith(APP) && !u.hostname.startsWith('fonts.'), (r) => r.abort());
}

async function main() {
  const { mkdirSync, writeFileSync } = await import('fs');
  mkdirSync(CAPTURE_DIR, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ---- Pass 1: capture the real screens at 440×956 @3x -------------
  const ctx = await browser.newContext({
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
  });
  await routeAppFonts(ctx);
  await ctx.addInitScript(([s, m]) => {
    localStorage.setItem('applux.session', JSON.stringify(s));
    localStorage.setItem('applux.merchant', JSON.stringify(m));
  }, [SESSION, MERCHANT]);
  const app = await ctx.newPage();
  for (const shot of SHOTS) {
    await shot.capture(app);
    await app.screenshot({ path: path.join(CAPTURE_DIR, `${shot.n}.png`) });
    console.log('captured', shot.n, '←', shot.source);
  }
  await ctx.close();

  // ---- Pass 2: compose via template.html ---------------------------
  const template = readFileSync(path.join(DIR, 'template.html'), 'utf8');
  const SIZES = [
    { w: 1320, h: 2868, suffix: '' },     // 6.9" (required slot)
    { w: 1284, h: 2778, suffix: '-65' },  // 6.5"
  ];
  for (const size of SIZES) {
    const cctx = await browser.newContext({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1,
    });
    // Serve template assets (fonts + captures) from a synthetic origin.
    await cctx.route('http://lend.appstore/**', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/') {
        return r.fulfill({ contentType: 'text/html', body: template });
      }
      if (u.pathname.startsWith('/fonts/')) {
        return r.fulfill({ contentType: 'font/woff2',
          body: readFileSync(path.join(DIR, u.pathname.slice(1))) });
      }
      if (u.pathname.startsWith('/captures/')) {
        return r.fulfill({ contentType: 'image/png',
          body: readFileSync(path.join(CAPTURE_DIR, u.pathname.slice(10))) });
      }
      return r.abort();
    });
    const page = await cctx.newPage();
    for (const shot of SHOTS) {
      await page.goto('http://lend.appstore/', { waitUntil: 'domcontentloaded' });
      await page.evaluate((p) => window.renderShot(p), {
        headline: shot.headline, sub: shot.sub, bg: shot.bg,
        statusBg: shot.statusBg, lockup: Boolean(shot.lockup),
        locale: shot.locale, img: `/captures/${shot.n}.png`,
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const file = path.join(OUT, `${shot.n}-lend-appstore-${shot.locale}${size.suffix}.png`);
      await page.screenshot({ path: file,
        clip: { x: 0, y: 0, width: size.w, height: size.h } });
      console.log('composed', file);
    }
    await cctx.close();
  }
  await browser.close();

  // ---- QA: exact dimensions + no alpha channel ---------------------
  const { readdirSync } = await import('fs');
  let bad = 0;
  for (const f of readdirSync(OUT).filter((f) => f.endsWith('.png'))) {
    const d = readFileSync(path.join(OUT, f));
    const w = d.readUInt32BE(16); const h = d.readUInt32BE(20);
    const colorType = d[25]; // 2 = RGB (no alpha), 6 = RGBA
    const want = f.includes('-65') ? [1284, 2778] : [1320, 2868];
    const ok = w === want[0] && h === want[1] && colorType === 2;
    console.log(ok ? 'QA OK  ' : 'QA FAIL', f, `${w}x${h}`, `colorType=${colorType}`);
    if (!ok) bad += 1;
  }
  if (bad) { console.error(bad, 'files failed QA'); process.exit(1); }
  console.log('all screenshots pass dimension/alpha QA');
}

main();
