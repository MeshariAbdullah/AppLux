// =====================================================================
// D-2 — Home / Eligibility available balance must come from the server
// breakdown (get_my_eligibility_breakdown), never `limit − used`.
// Run: npm run test:home-eligibility
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const home = read('src/pages/Home.tsx');
const elig = read('src/pages/Eligibility.tsx');
const hook = read('src/lib/useCustomerRentalData.ts');
const keys = read('src/lib/cache/keys.ts');
const review = read('src/pages/Review.tsx');
const ar = JSON.parse(read('src/locales/ar.json'));
const en = JSON.parse(read('src/locales/en.json'));

test('cache key for the authoritative breakdown exists', () => {
  assert.match(keys, /eligibilityBreakdown: \(uid: string\) => `eligibility:\$\{uid\}:breakdown`/);
});

test('customer data hook loads the breakdown with the shared lifecycle and includes it in refresh', () => {
  assert.match(hook, /cacheKeys\.eligibilityBreakdown\(uid\)/);
  assert.match(hook, /fetchMyEligibilityBreakdown\(\)/);
  assert.match(hook, /refetchOnFocus: true/);
  assert.match(hook, /breakdownQ\.refresh\]/, 'pull-to-refresh must revalidate the breakdown');
  assert.match(hook, /breakdownState/);
});

test('Home never renders the client-side remaining figure as the available amount', () => {
  assert.doesNotMatch(home, /formatCurrency\(eligibility\.remaining\)/);
  assert.match(home, /availableState === 'ready' && available !== null \? formatCurrency\(available\) : '—'/);
  assert.match(home, /home\.eligibilityCompact\.unavailable/);
  assert.match(home, /home\.eligibilityCompact\.loading/);
});

test('Eligibility page has no limit − used fallback and shows a placeholder when the RPC is unavailable', () => {
  assert.doesNotMatch(elig, /limit - used - reserved/);
  assert.match(elig, /available === null \? '—' : fmtCurrency\(available\)/);
  assert.match(elig, /eligibility\.unavailable/);
});

test('Review invalidates the breakdown on rejection, acceptance and activation', () => {
  const n = (review.match(/cacheKeys\.eligibilityBreakdown\(/g) ?? []).length;
  assert.ok(n >= 3, `expected ≥3 invalidation sites, found ${n}`);
});

test('locale copy exists in both languages', () => {
  for (const d of [ar, en]) {
    assert.ok(d.home.eligibilityCompact.unavailable.length > 0);
    assert.ok(d.home.eligibilityCompact.loading.length > 0);
    assert.ok(d.eligibility.unavailable.length > 0);
  }
});

// ---------------------------------------------------------------------
// Freshness contract (Product Owner final review): refocus, navigation,
// pull-to-refresh and administrator limit changes are served by the
// existing cache lifecycle — no polling, no extra infrastructure.
// Behaviour evidence (staging-backend preview, scratchpad script):
// refocus past FOCUS_REVALIDATE_MIN_MS re-fetches and shows the
// admin-raised figure; pull-to-refresh forces a re-fetch; an idle tab
// makes zero calls; SPA navigation within the TTL serves the cache.
// ---------------------------------------------------------------------
test('breakdown query revalidates on refocus and is part of pull-to-refresh, with no polling', () => {
  const cacheKeys = read('src/lib/cache/keys.ts');
  assert.match(cacheKeys, /export const FOCUS_REVALIDATE_MIN_MS = \d[\d_]*;/, 'anti-flap floor governs refocus');
  const q = hook.match(/const breakdownQ = useCachedQuery\(([\s\S]*?)\);/);
  assert.ok(q, 'breakdown query present');
  assert.match(q[1], /refetchOnFocus: true/);
  assert.match(q[1], /CACHE_TTL\.customerLists/);
  for (const [name, src] of [['hook', hook], ['Home', home], ['Eligibility', elig]]) {
    assert.doesNotMatch(src, /setInterval\(/, `${name} must not poll`);
  }
});
