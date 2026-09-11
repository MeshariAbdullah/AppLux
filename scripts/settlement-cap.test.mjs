// =====================================================================
// Settlement offer cap + offer-card readability — structural guards.
// Run: npm run test:settlement
// (DB behavior is covered by supabase/tests/settlement_offer_cap_test
//  .sql — 17 psql assertions against the full migration chain.)
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260502125900_settlement_offer_cap.sql');
const ar = JSON.parse(read('src/locales/ar.json'));
const en = JSON.parse(read('src/locales/en.json'));
const errors = read('src/lib/errors.ts');
const customer = read('src/pages/DisputeDetails.tsx');
const merchant = read('src/pages/merchant/MerchantDamageDetails.tsx');
const admin = read('src/pages/admin/AdminCaseDetails.tsx');

// ---------------------------------------------------------------------
// Copy — the exact approved wording, both languages
// ---------------------------------------------------------------------

test('cap error copy is the exact approved wording', () => {
  assert.equal(ar.disputes.settlement.overCap,
    'لا يمكن أن يتجاوز عرض التسوية القيمة الأصلية للقطعة: {amount} ر.س');
  assert.equal(en.disputes.settlement.overCap,
    'The settlement offer cannot exceed the original item value: SAR {amount}');
  assert.equal(ar.disputes.settlement.amountValue, 'قيمة العرض');
  assert.equal(en.disputes.settlement.amountValue, 'Offer amount');
  // Server-backstop copy (P0213 without a known cap client-side).
  assert.ok(ar.errors.settlementOverCap.includes('القيمة الأصلية للقطعة'));
  assert.ok(en.errors.settlementOverCap.includes('original item value'));
});

test('P0213 is mapped in translateError', () => {
  assert.ok(errors.includes("code === 'P0213'"));
  assert.ok(errors.includes("t('errors.settlementOverCap')"));
});

// ---------------------------------------------------------------------
// DB layer — cap in every proposal path, no fixed number
// ---------------------------------------------------------------------

test('cap is derived from the item value — never hardcoded', () => {
  assert.ok(migration.includes('create or replace function public.settlement_offer_cap'));
  assert.ok(migration.includes('nullif(c.original_item_value, 0)'), 'contract value first');
  assert.ok(migration.includes('nullif(i.original_item_value, 0)'), 'invoice fallback');
  // No fixed cap in executable SQL (comments may cite the example).
  const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(!/7[,.]?000/.test(sqlOnly), 'no hardcoded 7000 in SQL');
});

test('all four proposal RPCs enforce the cap; submits also require > 0', () => {
  for (const fn of ['submit_settlement_proposal', 'respond_to_settlement_proposal',
                    'lend_submit_mediation_proposal', 'respond_to_lend_proposal']) {
    assert.ok(migration.includes(`create or replace function public.${fn}`), fn);
  }
  assert.equal((migration.match(/errcode = 'P0213'/g) ?? []).length, 4,
    'both submit paths + both accept paths raise P0213');
  assert.equal((migration.match(/p_amount is null or p_amount <= 0/g) ?? []).length, 2,
    'both submit paths refuse zero/negative');
  // Accept paths guard only acceptance — rejection must stay open.
  for (const seg of migration.split('create or replace function').slice(1)) {
    if (!seg.startsWith(' public.respond_to')) continue;
    const guard = seg.indexOf("errcode = 'P0213'");
    assert.ok(guard > -1 && seg.slice(0, guard).includes('if p_accept then'),
      'accept-only cap guard');
  }
});

test('rounds logic is preserved verbatim', () => {
  assert.ok(migration.includes('select count(*) + 1 into v_round'));
  assert.ok(migration.includes('if v_round > 2 then'));
  assert.ok(migration.includes('if v_prop.round >= 2 then'), 'auto move to lend intact');
  assert.ok(migration.includes("'direct_settlement', v_prop.amount"), 'accept resolution intact');
});

// ---------------------------------------------------------------------
// UI layer — readable amount + client-side cap on every surface
// ---------------------------------------------------------------------

test('offer cards render the amount on its own labeled, unclipped line', () => {
  for (const [name, src] of [['customer', customer], ['merchant', merchant], ['admin', admin]]) {
    assert.ok(src.includes("t('disputes.settlement.amountValue')"), `${name}: label present`);
    assert.ok(!src.includes('text-[15px] font-bold text-ink-900 num">{formatCurrency'),
      `${name}: old cramped inline render gone`);
  }
  // Header rows wrap instead of squeezing the chip/amount.
  assert.ok(customer.includes('flex flex-wrap items-center justify-between'));
  assert.ok(merchant.includes('flex flex-wrap items-center justify-between'));
});

test('both party panels block over-cap submission and over-cap acceptance', () => {
  for (const [name, src] of [['customer', customer], ['merchant', merchant]]) {
    assert.ok(src.includes('amountValue > maxAmount'), `${name}: overCap check`);
    assert.ok(src.includes('amountValue > 0 && !overCap'), `${name}: > 0 and ≤ cap`);
    assert.ok(src.includes('disabled={busy || pendingOverCap}'), `${name}: accept disabled`);
    assert.ok(src.includes('disabled={busy || lendOverCap}'), `${name}: lend accept disabled`);
    assert.ok(src.includes("t('disputes.settlement.overCap'"), `${name}: exact copy shown`);
    assert.ok(src.includes("t('disputes.settlement.maxHint'"), `${name}: cap hint shown`);
    assert.ok(!src.includes('amountValue >= 0'), `${name}: zero offers no longer valid`);
  }
  // Admin mediation form has the same > 0 + cap validation.
  assert.ok(admin.includes('amountValue > 0 && !overCap'));
  assert.ok(!admin.includes('amountValue >= 0'));
});

test('the cap comes from the contract item value on all three pages', () => {
  for (const src of [customer, merchant, admin]) {
    assert.ok(src.includes('Number(contract.original_item_value) || Number(contract.total_amount)'));
  }
});
