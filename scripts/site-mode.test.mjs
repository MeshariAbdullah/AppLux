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
import {
  APP_HOSTNAME,
  BUSINESS_HOSTNAME,
  STAGING_HOSTNAME,
  resolveDeployEnv,
  resolveSiteMode,
} from './.site-mode-bundle.mjs';

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
// Deploy env matrix (production/staging labeling — never changes WHAT
// is served, only the staging badge)
// ---------------------------------------------------------------------

test('canonical hostnames are pinned', () => {
  assert.equal(APP_HOSTNAME, 'app.lend.sa');
  assert.equal(BUSINESS_HOSTNAME, 'business.lend.sa');
  assert.equal(STAGING_HOSTNAME, 'lendsa.vercel.app');
});

test('native builds NEVER label as staging, whatever env leaked in', () => {
  assert.equal(
    resolveDeployEnv(
      { VITE_DEPLOY_ENV: 'staging' },
      { isNative: true, hostname: STAGING_HOSTNAME },
    ),
    'production',
  );
  assert.equal(resolveDeployEnv({}, { isNative: true, hostname: '' }), 'production');
});

test('explicit VITE_DEPLOY_ENV wins on web deploys', () => {
  assert.equal(
    resolveDeployEnv({ VITE_DEPLOY_ENV: 'staging' }, { isNative: false, hostname: 'app.lend.sa' }),
    'staging',
    'explicit staging labels even a lend.sa host (misconfig is visible, not hidden)',
  );
  assert.equal(
    resolveDeployEnv(
      { VITE_DEPLOY_ENV: 'production' },
      { isNative: false, hostname: STAGING_HOSTNAME },
    ),
    'production',
    'explicit production suppresses the hostname backstop',
  );
});

test('lendsa.vercel.app hostname is labeled staging as a backstop', () => {
  assert.equal(
    resolveDeployEnv({}, { isNative: false, hostname: 'lendsa.vercel.app' }),
    'staging',
  );
  assert.equal(
    resolveDeployEnv({}, { isNative: false, hostname: 'LendSA.Vercel.APP' }),
    'staging',
    'case-insensitive',
  );
});

test('everything else is production (= no staging marker)', () => {
  for (const hostname of ['app.lend.sa', 'business.lend.sa', 'localhost', '127.0.0.1', 'preview-abc.vercel.app', '']) {
    assert.equal(resolveDeployEnv({}, { isNative: false, hostname }), 'production', hostname);
  }
  assert.equal(
    resolveDeployEnv({ VITE_DEPLOY_ENV: 'stage' }, { isNative: false, hostname: 'app.lend.sa' }),
    'production',
    'unknown env values are ignored',
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

test('staging badge is gated on DEPLOY_ENV and only on it', () => {
  assert.ok(routes.includes('const DEPLOY_ENV = resolveDeployEnv('), 'DEPLOY_ENV computed via the resolver');
  assert.ok(routes.includes("{DEPLOY_ENV === 'staging' && <StagingBadge />}"), 'badge mounts only when staging');
  assert.ok(routes.includes('data-testid="staging-badge"'));
  // The label is localized, not hardcoded.
  assert.ok(routes.includes("t('app.stagingBadge')"));
});

test('staging badge copy exists in both languages', () => {
  const ar = JSON.parse(read('src/locales/ar.json'));
  const en = JSON.parse(read('src/locales/en.json'));
  assert.ok(ar.app.stagingBadge, 'ar');
  assert.ok(en.app.stagingBadge, 'en');
  assert.ok(/[؀-ۿ]/.test(ar.app.stagingBadge));
});

test('auth email links use appWebOrigin (VITE_APP_ORIGIN-aware), never a raw webview origin', () => {
  const auth = read('src/lib/supabase/auth.ts');
  assert.ok(auth.includes('export function appWebOrigin()'), 'appWebOrigin exists');
  assert.ok(auth.includes('VITE_APP_ORIGIN'), 'reads the canonical origin env');
  assert.ok(
    auth.includes('emailRedirectTo: `${appWebOrigin()}/merchant/login`'),
    'merchant signup confirmation goes through appWebOrigin',
  );
  assert.ok(
    auth.includes('`${appWebOrigin()}/auth/reset-password`'),
    'password reset goes through appWebOrigin',
  );
  // No email link may be built from window.location.origin directly —
  // that is the capacitor://localhost bug class.
  assert.ok(
    !/emailRedirectTo:[^,\n]*window\.location\.origin/.test(auth),
    'no raw window.location.origin in emailRedirectTo',
  );
});

test('deployment docs + env template name the production origin', () => {
  const envExample = read('.env.example');
  assert.ok(envExample.includes('VITE_DEPLOY_ENV='), 'env template documents VITE_DEPLOY_ENV');
  assert.ok(envExample.includes('https://app.lend.sa'), 'env template names the production origin');
  const deployment = read('docs/deployment.md');
  for (const needle of ['app.lend.sa', 'business.lend.sa', 'lendsa.vercel.app', 'production', 'staging']) {
    assert.ok(deployment.includes(needle), `docs/deployment.md mentions ${needle}`);
  }
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
