// =====================================================================
// Merchant rental-session draft persistence — unit + security guards.
// Run: npm run test:draft
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MERCHANT_SESSION_DRAFT_TTL_MS,
  MERCHANT_SESSION_DRAFT_VERSION,
  buildMerchantSessionDraft,
  merchantSessionDraftKey,
  parseMerchantSessionDraft,
} from './.merchant-draft-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const NOW = 1_800_000_000_000;

const midSession = {
  step: 'contract',
  verify: {
    mobile: '0512345678',
    status: 'verified',
    challenge: '482913', // the typed OTP — must NEVER be persisted
    renter: { id: 'uuid-renter', full_name: 'اسم العميل السري' },
    renterId: 'uuid-renter',
  },
  operation: {
    itemName: 'فستان سهرة',
    category: 'dress',
    lesseeNationalId: '1234567890',
    startsAt: '2026-09-13T10:00',
    pricingType: 'daily',
    rentalDays: '3',
    dailyRate: '300',
    totalRentalAmount: '',
    originalItemValue: '3000',
    damageChargeType: 'percentage',
    lightDamagePercent: '30',
    damageFixedAmount: '',
    lateFeeType: 'percentage',
    lateFeePercent: '20',
    lateFeeFixedAmount: '',
  },
  eligibility: { row: { limit_amount: 99999 }, loading: false, error: null },
  issue: { invoice: { id: 'inv-uuid' }, submitting: false, error: null },
};

test('draft round-trips form fields, step, and the verification CLAIM', () => {
  const draft = buildMerchantSessionDraft(midSession, NOW);
  assert.ok(draft);
  const restored = parseMerchantSessionDraft(JSON.stringify(draft), NOW + 60_000);
  assert.ok(restored);
  assert.equal(restored.step, 'contract');
  assert.equal(restored.mobile, '0512345678');
  assert.equal(restored.wasVerified, true);
  assert.equal(restored.operation.itemName, 'فستان سهرة');
  assert.equal(restored.operation.lateFeePercent, '20');
});

test('the OTP code, renter PII, and server-derived state are NEVER persisted', () => {
  const json = JSON.stringify(buildMerchantSessionDraft(midSession, NOW));
  assert.ok(!json.includes('482913'), 'typed OTP code leaked');
  assert.ok(!json.includes('challenge'), 'challenge field leaked');
  assert.ok(!json.includes('اسم العميل السري'), 'renter name leaked');
  assert.ok(!json.includes('uuid-renter'), 'renter id leaked');
  assert.ok(!json.includes('eligibility') && !json.includes('99999'), 'eligibility leaked');
  assert.ok(!json.includes('inv-uuid'), 'issued invoice leaked');
});

test('issued sessions and pristine step-1 state persist nothing', () => {
  assert.equal(buildMerchantSessionDraft({ ...midSession, step: 'issued' }, NOW), null);
  assert.equal(
    buildMerchantSessionDraft(
      {
        step: 'start',
        verify: { mobile: '', status: 'unverified' },
        operation: { ...midSession.operation, itemName: '', lesseeNationalId: '',
          dailyRate: '', originalItemValue: '', lateFeePercent: '' },
      },
      NOW,
    ),
    null,
  );
});

test('expired, future-dated, wrong-version, and malformed drafts are ignored', () => {
  const draft = buildMerchantSessionDraft(midSession, NOW);
  const stale = { ...draft, savedAt: NOW - MERCHANT_SESSION_DRAFT_TTL_MS - 1 };
  assert.equal(parseMerchantSessionDraft(JSON.stringify(stale), NOW), null);
  const future = { ...draft, savedAt: NOW + 3_600_000 };
  assert.equal(parseMerchantSessionDraft(JSON.stringify(future), NOW), null);
  const wrongV = { ...draft, v: MERCHANT_SESSION_DRAFT_VERSION + 1 };
  assert.equal(parseMerchantSessionDraft(JSON.stringify(wrongV), NOW), null);
  assert.equal(parseMerchantSessionDraft('{not json', NOW), null);
  assert.equal(parseMerchantSessionDraft(null, NOW), null);
});

test('an unverified draft can never restore past the verify step', () => {
  const forged = {
    ...buildMerchantSessionDraft(midSession, NOW),
    wasVerified: false,
    step: 'contract',
  };
  const restored = parseMerchantSessionDraft(JSON.stringify(forged), NOW);
  assert.equal(restored.step, 'verify');
});

test('draft key is versioned per user', () => {
  assert.equal(
    merchantSessionDraftKey('user-1'),
    'lend:merchant-rental-session-draft:user-1',
  );
});

// ---------------------------------------------------------------------
// Structural guards — wizard wiring + server-confirmed restore
// ---------------------------------------------------------------------

const wizard = read('src/pages/merchant/MerchantRentalSession.tsx');
const migration = read('supabase/migrations/20260502130200_renter_verification_status.sql');
const ar = JSON.parse(read('src/locales/ar.json'));
const en = JSON.parse(read('src/locales/en.json'));

test('restore re-confirms verification server-side, never from storage', () => {
  assert.ok(wizard.includes('checkRenterVerification(draft.mobile)'));
  // The lapsed/unconfirmable paths both land on the verify step.
  assert.equal((wizard.match(/step: 'verify' \}\)\);\n\s+setDraftBanner\('reverify'\)/g) ?? []).length, 3);
  // The migration mirrors the exact P0195 predicate.
  assert.ok(migration.includes("interval '30 minutes'"));
  assert.ok(migration.includes('used_invoice_id is null'));
  assert.ok(migration.includes('verified_at is not null'));
});

test('saves are debounced and cleared on issuance; discard is visible', () => {
  assert.ok(wizard.includes('window.setTimeout') && wizard.includes(', 800)'), 'debounced save');
  assert.equal((wizard.match(/clearDraft\(\);\n\s+setStep\('issued'\)/g) ?? []).length, 2,
    'both issue paths clear the draft immediately');
  assert.ok(wizard.includes('onClick={discardDraft}'));
  assert.equal(ar.merchant.session.draft.restored, 'تمت استعادة مسودة عرض الإيجار.');
  assert.equal(ar.merchant.session.draft.discard, 'مسح المسودة');
  assert.equal(en.merchant.session.draft.restored, 'Rental offer draft restored.');
  assert.equal(en.merchant.session.draft.discard, 'Discard draft');
});
