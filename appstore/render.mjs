// =====================================================================
// Lend — App Store screenshot generator (Arabic iPhone set).
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
import { MERCHANT, SESSION, buildShots } from './shots.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const CAPTURE_DIR = process.env.CAPTURE_DIR || path.join(DIR, '.captures');
const OUT = path.join(DIR, 'ar');

// The shared 6-shot campaign (appstore/shots.mjs) framed for iPhone.
const SHOTS = buildShots(APP, 'phone').map((s) => ({
  ...s, locale: 'ar', headline: s.headlinePhone ?? s.headline,
}));

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
