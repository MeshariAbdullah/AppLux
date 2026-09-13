// =====================================================================
// Pull-to-refresh — gesture controller behavior + wiring guards.
// Run: npm run test:refresh
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PULL_MAX_PX,
  PULL_MIN_SPIN_MS,
  PULL_REFRESH_THRESHOLD_PX,
  PULL_RESISTANCE,
  createPullToRefreshController,
  pullOffsetFor,
} from './.pull-to-refresh-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

/** Test host: records effects, injects a controllable clock, and lets
 *  the refresh promise be resolved on demand. */
function makeHost({ scrollTop = 0, refreshImpl } = {}) {
  const calls = { refresh: 0, offsets: [], phases: [] };
  let clock = 0;
  const pendingDelays = [];
  const host = {
    getScrollTop: () => scrollTop,
    setOffset: (px, animate) => calls.offsets.push({ px, animate }),
    setPhase: (p) => calls.phases.push(p),
    onRefresh: () => {
      calls.refresh += 1;
      return refreshImpl ? refreshImpl() : undefined;
    },
    now: () => clock,
    delay: (ms) =>
      new Promise((resolve) => pendingDelays.push({ ms, resolve })),
  };
  return {
    host,
    calls,
    setClock: (t) => {
      clock = t;
    },
    flushDelay: () => {
      const d = pendingDelays.shift();
      if (d) d.resolve();
      return d?.ms;
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

// Drag distance whose resisted offset clears the threshold.
const BIG_DRAG = Math.ceil(PULL_REFRESH_THRESHOLD_PX / PULL_RESISTANCE) + 10;

test('resistance math: proportional, floored at 0, capped', () => {
  assert.equal(pullOffsetFor(-20), 0);
  assert.equal(pullOffsetFor(0), 0);
  assert.equal(pullOffsetFor(100), 100 * PULL_RESISTANCE);
  assert.equal(pullOffsetFor(100000), PULL_MAX_PX);
  // The threshold is reachable under the cap — the gesture can fire.
  assert.ok(PULL_REFRESH_THRESHOLD_PX < PULL_MAX_PX);
});

test('full gesture: pull past threshold → one refresh, spinner floor, clean close', async () => {
  const { host, calls, setClock, flushDelay } = makeHost();
  const c = createPullToRefreshController(host);

  c.touchStart({ y: 100 });
  assert.equal(c.touchMove({ y: 130 }), true, 'owning the gesture → preventDefault');
  assert.equal(c.getPhase(), 'pulling');
  assert.equal(c.touchMove({ y: 100 + BIG_DRAG }), true);
  assert.equal(c.getPhase(), 'ready');

  c.touchEnd();
  assert.equal(c.getPhase(), 'refreshing');
  // Indicator locked open at the threshold, animated.
  assert.deepEqual(calls.offsets.at(-1), {
    px: PULL_REFRESH_THRESHOLD_PX,
    animate: true,
  });
  // The refresh "takes" 10ms — the clock moves before its resolution
  // is observed, so the spinner holds for the remaining floor instead
  // of flashing.
  setClock(10);
  await settle();
  assert.equal(calls.refresh, 1);
  assert.equal(flushDelay(), PULL_MIN_SPIN_MS - 10);
  await settle();
  assert.equal(c.getPhase(), 'idle');
  assert.deepEqual(calls.offsets.at(-1), { px: 0, animate: true });
});

test('a slow refresh gets no extra hold', async () => {
  const { host, setClock, flushDelay } = makeHost({
    refreshImpl: () => Promise.resolve(),
  });
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 0 });
  c.touchMove({ y: BIG_DRAG });
  c.touchEnd();
  setClock(PULL_MIN_SPIN_MS + 500); // refresh "took" longer than the floor
  await settle();
  assert.equal(flushDelay(), undefined, 'no artificial delay queued');
  assert.equal(c.getPhase(), 'idle');
});

test('release under the threshold refreshes nothing', async () => {
  const { host, calls } = makeHost();
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 0 });
  c.touchMove({ y: 30 }); // 30 * 0.42 ≈ 12.6px — far under
  assert.equal(c.getPhase(), 'pulling');
  c.touchEnd();
  await settle();
  assert.equal(calls.refresh, 0);
  assert.equal(c.getPhase(), 'idle');
  assert.deepEqual(calls.offsets.at(-1), { px: 0, animate: true });
});

test('mid-list scroll never engages the gesture', () => {
  const { host, calls } = makeHost({ scrollTop: 240 });
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 0 });
  assert.equal(c.touchMove({ y: 500 }), false, 'native scroll keeps the event');
  assert.equal(c.getPhase(), 'idle');
  c.touchEnd();
  assert.equal(calls.refresh, 0);
});

test('upward drag at the top stays a scroll', () => {
  const { host, calls } = makeHost();
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 300 });
  assert.equal(c.touchMove({ y: 200 }), false);
  assert.equal(c.getPhase(), 'idle');
  c.touchEnd();
  assert.equal(calls.refresh, 0);
});

test('one gesture, one refresh: pulls during refreshing are ignored', async () => {
  const { host, calls, flushDelay } = makeHost();
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 0 });
  c.touchMove({ y: BIG_DRAG });
  c.touchEnd();
  assert.equal(c.getPhase(), 'refreshing');

  // Frantic second pull while the first refresh runs.
  c.touchStart({ y: 0 });
  assert.equal(c.touchMove({ y: BIG_DRAG }), false);
  c.touchEnd();
  await settle();
  assert.equal(calls.refresh, 1);
  flushDelay();
  await settle();
  assert.equal(c.getPhase(), 'idle');
});

test('a rejected refresh still closes cleanly', async () => {
  const { host, calls, setClock } = makeHost({
    refreshImpl: () => Promise.reject(new Error('network')),
  });
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 0 });
  c.touchMove({ y: BIG_DRAG });
  setClock(0);
  c.touchEnd();
  setClock(PULL_MIN_SPIN_MS); // skip the hold
  await settle();
  await settle();
  assert.equal(calls.refresh, 1);
  assert.equal(c.getPhase(), 'idle');
});

test('destroy mid-gesture stops all host effects', async () => {
  const { host, calls } = makeHost();
  const c = createPullToRefreshController(host);
  c.touchStart({ y: 0 });
  c.touchMove({ y: BIG_DRAG });
  c.destroy();
  const before = calls.offsets.length;
  c.touchEnd();
  await settle();
  assert.equal(calls.offsets.length, before, 'no offsets after destroy');
  assert.equal(calls.refresh, 0);
});

// ---------------------------------------------------------------------
// Wiring guards — the covered screens, the approved copy, and the
// protections the spec calls out (wizard state, push registration).
// ---------------------------------------------------------------------

const COVERED_SCREENS = [
  'src/pages/Home.tsx',
  'src/pages/Contracts.tsx',
  'src/pages/Notifications.tsx',
  'src/pages/Profile.tsx',
  'src/pages/merchant/MerchantHome.tsx',
  'src/pages/merchant/MerchantRentals.tsx',
  'src/pages/merchant/MerchantDamages.tsx',
  'src/pages/merchant/MerchantNotifications.tsx',
  'src/pages/merchant/MerchantProfile.tsx',
  'src/pages/admin/AdminHome.tsx',
  'src/pages/admin/AdminCases.tsx',
  'src/pages/admin/AdminUsers.tsx',
  'src/pages/admin/AdminMerchants.tsx',
];

test('every main screen passes onRefresh to Screen', () => {
  for (const p of COVERED_SCREENS) {
    assert.ok(read(p).includes('onRefresh='), `missing onRefresh: ${p}`);
  }
});

test('the rental-session wizard deliberately has NO pull-to-refresh', () => {
  const wizard = read('src/pages/merchant/MerchantRentalSession.tsx');
  assert.ok(!wizard.includes('onRefresh'), 'an accidental pull must never touch wizard state');
});

test('refresh wiring cannot reset form state or re-register push tokens', () => {
  // The gesture layer itself is pure: no storage, no push imports.
  for (const p of ['src/lib/pullToRefresh.ts', 'src/components/layout/Screen.tsx']) {
    const src = read(p);
    assert.ok(!src.includes('registerPush'), `${p} must not touch push registration`);
    assert.ok(!src.includes('localStorage'), `${p} must not touch storage`);
  }
  // Screens refresh through query revalidation / load-effect re-runs
  // only — none of the callbacks reaches into push registration or the
  // merchant draft store.
  for (const p of COVERED_SCREENS) {
    const src = read(p);
    assert.ok(!src.includes('registerPush'), `${p}: refresh must not re-register push`);
    assert.ok(
      !src.includes('merchantSessionDraft'),
      `${p}: refresh must not touch the wizard draft`,
    );
  }
});

test('useCachedQuery.refresh is awaitable (spinner tracks the real fetch)', () => {
  const src = read('src/lib/cache/useCachedQuery.ts');
  assert.ok(src.includes('refresh: () => Promise<void>'));
  assert.ok(src.includes('const refresh = useCallback((): Promise<void> =>'));
});

test('useCustomerRentalData exposes a combined refresh for Home + Contracts', () => {
  const src = read('src/lib/useCustomerRentalData.ts');
  assert.ok(src.includes('refresh: () => Promise<void>'));
  for (const p of ['src/pages/Home.tsx', 'src/pages/Contracts.tsx']) {
    assert.ok(read(p).includes('refresh: refreshRentalData'), p);
  }
});

test('approved copy: «اسحب للتحديث» / "Pull to refresh"', () => {
  const ar = JSON.parse(read('src/locales/ar.json'));
  const en = JSON.parse(read('src/locales/en.json'));
  assert.equal(ar.common.pullToRefresh, 'اسحب للتحديث');
  assert.equal(en.common.pullToRefresh, 'Pull to refresh');
  const screen = read('src/components/layout/Screen.tsx');
  assert.ok(screen.includes("t('common.pullToRefresh')"));
});
