// =====================================================================
// Lend — App Store screenshot generator, 13" iPad Arabic set.
// =====================================================================
// Same pipeline and visual system as the iPhone set (render.mjs):
// boots the REAL app in demo mode (Vite dev server on APP_URL,
// default http://127.0.0.1:4173), captures five real screens at iPad
// Pro 13" logical size (1024×1366 @2x), then composes each into the
// campaign canvas via template.html (variant: 'ipad') and emits the
// App Store Connect 13-inch portrait size:
//
//   appstore/ar-ipad/NN-lend-appstore-ar-ipad.png   2064×2752
//
// Regenerate:   npm run dev  (in another shell)   then
//               npm run appstore:ar:ipad
//
// All demo data is fictional (seeded demo store); the review approval
// is never submitted.
// =====================================================================
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { MERCHANT, SESSION, buildShots } from './shots.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const CAPTURE_DIR = process.env.CAPTURE_DIR || path.join(DIR, '.captures-ipad');
const OUT = path.join(DIR, 'ar-ipad');

// The shared 6-shot campaign (appstore/shots.mjs) framed for iPad.
const SHOTS = buildShots(APP, 'pad').map((s) => ({ ...s, locale: 'ar' }));

// ---------------------------------------------------------------------
// Local font service — identical to render.mjs.
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
  const { mkdirSync } = await import('fs');
  mkdirSync(CAPTURE_DIR, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ---- Pass 1: capture the real screens at 1024×1366 @2x -----------
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
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

  // ---- Pass 2: compose via template.html (ipad variant) ------------
  const template = readFileSync(path.join(DIR, 'template.html'), 'utf8');
  const SIZE = { w: 2064, h: 2752 }; // App Store Connect 13" portrait
  const cctx = await browser.newContext({
    viewport: { width: SIZE.w, height: SIZE.h }, deviceScaleFactor: 1,
  });
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
      statusBg: 'transparent', lockup: Boolean(shot.lockup),
      locale: shot.locale, variant: 'ipad', img: `/captures/${shot.n}.png`,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const file = path.join(OUT, `${shot.n}-lend-appstore-ar-ipad.png`);
    await page.screenshot({ path: file,
      clip: { x: 0, y: 0, width: SIZE.w, height: SIZE.h } });
    console.log('composed', file);
  }
  await cctx.close();
  await browser.close();

  // ---- QA: exact dimensions + no alpha channel ---------------------
  const { readdirSync } = await import('fs');
  let bad = 0;
  for (const f of readdirSync(OUT).filter((f) => f.endsWith('.png'))) {
    const d = readFileSync(path.join(OUT, f));
    const w = d.readUInt32BE(16); const h = d.readUInt32BE(20);
    const colorType = d[25]; // 2 = RGB (no alpha), 6 = RGBA
    const ok = w === 2064 && h === 2752 && colorType === 2;
    console.log(ok ? 'QA OK  ' : 'QA FAIL', f, `${w}x${h}`, `colorType=${colorType}`);
    if (!ok) bad += 1;
  }
  if (bad) { console.error(bad, 'files failed QA'); process.exit(1); }
  console.log('all iPad screenshots pass dimension/alpha QA');
}

main();
