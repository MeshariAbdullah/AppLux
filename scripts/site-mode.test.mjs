// =====================================================================
// Site mode — resolver matrix + structural route-gating guards.
// Run: npm run test:sitemode
// Behavior in a real browser is covered by tests/site-mode.spec.ts
// (Playwright, second dev server with VITE_SITE_MODE=business).
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BUSINESS_HOSTNAME, resolveSiteMode } from './.site-mode-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// ---------------------------------------------------------------------
// Resolver matrix (the seven approved rules)
// ---------------------------------------------------------------------

test('native Capacitor ALWAYS resolves full — even with env and hostname set', () => {
  assert.equal(
    resolveSiteMode(
      { VITE_SITE_MODE: 'business' },
      { isNative: true, hostname: BUSINESS_HOSTNAME },
    ),
    'full',
  );
  assert.equal(resolveSiteMode({}, { isNative: true, hostname: '' }), 'full');
});

test('business.lend.sa hostname forces business even without the env var', () => {
  assert.equal(
    resolveSiteMode({}, { isNative: false, hostname: 'business.lend.sa' }),
    'business',
  );
  assert.equal(
    resolveSiteMode({}, { isNative: false, hostname: 'Business.Lend.SA' }),
    'business',
    'case-insensitive',
  );
  assert.equal(
    resolveSiteMode({}, { isNative: false, hostname: 'www.business.lend.sa' }),
    'business',
    'subdomain of the business host',
  );
});

test('VITE_SITE_MODE=business enables business mode on any web host', () => {
  assert.equal(
    resolveSiteMode(
      { VITE_SITE_MODE: 'business' },
      { isNative: false, hostname: 'preview-abc.vercel.app' },
    ),
    'business',
  );
});

test('everything else is full mode (fail-open toward the FULL app only)', () => {
  assert.equal(resolveSiteMode({}, { isNative: false, hostname: 'lendsa.vercel.app' }), 'full');
  assert.equal(resolveSiteMode({}, { isNative: false, hostname: 'localhost' }), 'full');
  assert.equal(
    resolveSiteMode({ VITE_SITE_MODE: 'true' }, { isNative: false, hostname: 'lendsa.vercel.app' }),
    'full',
    'unknown env values do not flip modes',
  );
  // A lookalike host is NOT the business portal.
  assert.equal(
    resolveSiteMode({}, { isNative: false, hostname: 'notbusiness.lend.sa' }),
    'full',
  );
});

// ---------------------------------------------------------------------
// Structural guards — the mode is consumed ONLY by routes.tsx, and the
// route tree gates exactly the approved groups.
// ---------------------------------------------------------------------

const routes = read('src/routes.tsx');

test('siteMode is consumed only by routes.tsx', async () => {
  const { execSync } = await import('node:child_process');
  const hits = execSync(
    "grep -rl \"from '@/lib/siteMode'\" src --include='*.ts' --include='*.tsx'",
    { cwd: root, encoding: 'utf8' },
  ).trim().split('\n');
  assert.deepEqual(hits.sort(), ['src/routes.tsx']);
});

test('business mode unregisters the customer area, admin area and customer auth', () => {
  // Customer area group and admin group both sit behind !BUSINESS_PORTAL.
  assert.ok(routes.includes('const BUSINESS_PORTAL = SITE_MODE === \'business\''));
  const customerGate = routes.indexOf('{!BUSINESS_PORTAL && (\n      <Route\n        element={\n          <RequireCustomer>');
  assert.ok(customerGate > -1, 'customer area gated');
  assert.ok(/\{!BUSINESS_PORTAL && \(\s*\n\s*<>\s*\n\s*<Route\s*\n\s*path="\/admin\/home"/.test(routes), 'admin area gated');
  assert.ok(routes.includes('<Route path="/welcome" element={<Welcome />} />'), 'customer welcome still exists in full mode');
  // Customer auth entry screens sit inside a !BUSINESS_PORTAL block.
  const authGate = routes.indexOf('{!BUSINESS_PORTAL && (');
  assert.ok(authGate > -1 && authGate < routes.indexOf('path="/auth/login" element={<Login />}'));
});

test('shared auth utility routes are registered UNCONDITIONALLY', () => {
  for (const p of ['/auth/forgot-password', '/auth/verify-email', '/auth/reset-password']) {
    const at = routes.indexOf(`path="${p}"`);
    assert.ok(at > -1, p);
    // They live outside the !BUSINESS_PORTAL customer-auth block: the
    // block closes (`)}`) before these routes appear.
    const blockClose = routes.indexOf(')}', routes.indexOf('{!BUSINESS_PORTAL && ('));
    assert.ok(at > blockClose, `${p} outside the gated block`);
  }
});

test('business mode redirects customer entry points to the merchant ones', () => {
  assert.ok(routes.includes('{BUSINESS_PORTAL && ('));
  assert.ok(routes.includes('<Route path="/welcome" element={<Navigate to="/merchant/welcome" replace />} />'));
  assert.ok(routes.includes('<Route path="/auth/login" element={<Navigate to="/merchant/login" replace />} />'));
});

test('root + catch-all + wrong-role handling in business mode', () => {
  // RootRedirect: unauthenticated business → merchant welcome.
  assert.ok(routes.includes("BUSINESS_PORTAL ? '/merchant/welcome' : '/welcome'"));
  // Authenticated non-merchant → the portal-only screen with the
  // approved affordances (lend.sa link + sign out).
  assert.ok(routes.includes("BUSINESS_PORTAL && role !== 'merchant'"));
  assert.ok(routes.includes('<BusinessPortalOnly onSignOut={signOut} />'));
  assert.ok(routes.includes('href="https://www.lend.sa"'));
  // One catch-all funnels unknown paths through '/'.
  assert.ok(routes.includes('<Route path="*" element={<Navigate to="/" replace />} />'));
});

test('native pinning is wired: isNativePlatform feeds the resolver', () => {
  assert.ok(routes.includes('Capacitor.isNativePlatform()'));
  assert.ok(routes.includes('resolveSiteMode('));
});

test('portal-only copy exists in both languages', () => {
  const ar = JSON.parse(read('src/locales/ar.json'));
  const en = JSON.parse(read('src/locales/en.json'));
  for (const k of ['title', 'body', 'siteCta', 'signOutCta']) {
    assert.ok(ar.business.portalOnly[k], `ar ${k}`);
    assert.ok(en.business.portalOnly[k], `en ${k}`);
  }
  assert.ok(/[؀-ۿ]/.test(ar.business.portalOnly.title));
});
