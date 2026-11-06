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
