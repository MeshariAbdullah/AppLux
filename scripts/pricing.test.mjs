// Node unit tests for src/lib/pricing.ts — the centralized rental
// pricing/penalty math. Run via `npm run test:pricing` (esbuild bundles
// the dependency-free TS module, then node --test executes this file).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRentalTotal,
  computeLightDamageCharge,
  computeLateFeePerDay,
  resolveInvoicePricing,
} from './.pricing-bundle.mjs';

const base = {
  pricingType: 'daily',
  dailyRate: 200,
  rentalDays: 3,
  totalAmount: 0,
  itemValue: 5000,
  damageChargeType: 'percentage',
  lightDamageFraction: 0.3,
  damageFixedAmount: 0,
  lateFeeType: 'multiplier',
  lateReturnMultiplier: 1.5,
  lateFeeFixedAmount: 0,
};

test('daily pricing total = rate × days', () => {
  assert.equal(computeRentalTotal(base), 600);
});

test('total pricing uses the entered amount, never days', () => {
  const cfg = { ...base, pricingType: 'total', totalAmount: 950, dailyRate: 0 };
  assert.equal(computeRentalTotal(cfg), 950);
  assert.equal(computeRentalTotal({ ...cfg, rentalDays: 99 }), 950);
});

test('damage percentage = item value × fraction (rounded)', () => {
  assert.equal(computeLightDamageCharge(base), 1500);
  assert.equal(computeLightDamageCharge({ ...base, lightDamageFraction: 0.333 }), 1665);
});

test('damage fixed = entered amount, item value irrelevant', () => {
  const cfg = { ...base, damageChargeType: 'fixed', damageFixedAmount: 400 };
  assert.equal(computeLightDamageCharge(cfg), 400);
  assert.equal(computeLightDamageCharge({ ...cfg, itemValue: 0 }), 400);
});

test('late multiplier = daily rate × multiplier (legacy formula)', () => {
  assert.equal(computeLateFeePerDay(base), 300);
});

test('late fixed = entered amount per late day', () => {
  const cfg = { ...base, lateFeeType: 'fixed', lateFeeFixedAmount: 120 };
  assert.equal(computeLateFeePerDay(cfg), 120);
});

test('late multiplier under total pricing falls back to average daily base', () => {
  const cfg = {
    ...base,
    pricingType: 'total',
    totalAmount: 900,
    rentalDays: 3,
    dailyRate: 0,
  };
  assert.equal(computeLateFeePerDay(cfg), 450); // (900/3) × 1.5
});

test('negative inputs clamp to zero-safe results', () => {
  assert.equal(computeRentalTotal({ ...base, dailyRate: -5 }), 0);
  assert.equal(
    computeLightDamageCharge({ ...base, damageChargeType: 'fixed', damageFixedAmount: -1 }),
    0,
  );
  assert.equal(
    computeLateFeePerDay({ ...base, lateFeeType: 'fixed', lateFeeFixedAmount: -1 }),
    0,
  );
});

// ---- resolver: backward compatibility ---------------------------------

const legacyInvoice = {
  subtotal_amount: 600,
  light_damage_fraction: 0.25,
  late_return_multiplier: 2,
  // no pricing_type / damage_charge_type / late_fee_type columns at all
};
const legacyItems = [{ daily_rate: 200, rental_days: 3, replacement_value: 4000 }];

test('legacy rows resolve to daily/percentage/multiplier', () => {
  const cfg = resolveInvoicePricing(legacyInvoice, legacyItems);
  assert.equal(cfg.pricingType, 'daily');
  assert.equal(cfg.damageChargeType, 'percentage');
  assert.equal(cfg.lateFeeType, 'multiplier');
  assert.equal(computeRentalTotal(cfg), 600);
  assert.equal(computeLightDamageCharge(cfg), 1000); // 4000 × 0.25
  assert.equal(computeLateFeePerDay(cfg), 400); // 200 × 2
});

test('missing fraction/multiplier fall back to product defaults', () => {
  const cfg = resolveInvoicePricing({ subtotal_amount: 100 }, legacyItems);
  assert.equal(cfg.lightDamageFraction, 0.3);
  assert.equal(cfg.lateReturnMultiplier, 1.5);
});

test('total-priced rows resolve with subtotal as the rental amount', () => {
  const cfg = resolveInvoicePricing(
    {
      pricing_type: 'total',
      subtotal_amount: 950,
      damage_charge_type: 'fixed',
      damage_fixed_amount: 300,
      late_fee_type: 'fixed',
      late_fee_fixed_amount: 80,
    },
    [{ daily_rate: 0, rental_days: 4, replacement_value: 2500 }],
  );
  assert.equal(cfg.pricingType, 'total');
  assert.equal(computeRentalTotal(cfg), 950);
  assert.equal(computeLightDamageCharge(cfg), 300);
  assert.equal(computeLateFeePerDay(cfg), 80);
  assert.equal(cfg.rentalDays, 4); // duration preserved, amount untouched
});

test('unknown type strings degrade to the legacy behaviors', () => {
  const cfg = resolveInvoicePricing(
    { pricing_type: 'weird', subtotal_amount: 10, damage_charge_type: 'x', late_fee_type: 'y' },
    legacyItems,
  );
  assert.equal(cfg.pricingType, 'daily');
  assert.equal(cfg.damageChargeType, 'percentage');
  assert.equal(cfg.lateFeeType, 'multiplier');
});

// ---------------------------------------------------------------------
// Late-return percentage mode (20260502130100) — the fee must be
// exactly the merchant's configured rule, never a hidden default.
// ---------------------------------------------------------------------

test('percentage mode: rental price × percent per late day (the 300 @ 20% → 60 case)', () => {
  const cfg = resolveInvoicePricing(
    {
      subtotal_amount: 300,
      late_fee_type: 'percentage',
      late_return_multiplier: 0.2, // stored as a fraction
    },
    [{ daily_rate: 300, rental_days: 1, replacement_value: 3000 }],
  );
  assert.equal(cfg.lateFeeType, 'percentage');
  assert.equal(cfg.lateFeePercent, 20);
  assert.equal(computeLateFeePerDay(cfg), 60);
  // The item value (3000) plays NO part in the late fee.
  assert.notEqual(computeLateFeePerDay(cfg), 450);
});

test('percentage mode uses the RENTAL PRICE under both pricing models', () => {
  // daily: 100 × 3 days = 300 rental → 10% = 30/day
  const daily = resolveInvoicePricing(
    { subtotal_amount: 300, late_fee_type: 'percentage', late_return_multiplier: 0.1 },
    [{ daily_rate: 100, rental_days: 3, replacement_value: 9000 }],
  );
  assert.equal(computeLateFeePerDay(daily), 30);
  // total: entered 900 rental → 10% = 90/day (no daily rate involved)
  const total = resolveInvoicePricing(
    { pricing_type: 'total', subtotal_amount: 900, late_fee_type: 'percentage', late_return_multiplier: 0.1 },
    [{ daily_rate: 0, rental_days: 3, replacement_value: 9000 }],
  );
  assert.equal(computeLateFeePerDay(total), 90);
});

test('zero/absent values yield ZERO — no invented percentage or multiplier', () => {
  const zeroPct = resolveInvoicePricing(
    { subtotal_amount: 300, late_fee_type: 'percentage', late_return_multiplier: 0 },
    [{ daily_rate: 300, rental_days: 1, replacement_value: 3000 }],
  );
  assert.equal(computeLateFeePerDay(zeroPct), 0);
  const absentPct = resolveInvoicePricing(
    { subtotal_amount: 300, late_fee_type: 'percentage' },
    [{ daily_rate: 300, rental_days: 1, replacement_value: 3000 }],
  );
  assert.equal(absentPct.lateFeePercent, 0);
  assert.equal(computeLateFeePerDay(absentPct), 0);
  const zeroFixed = resolveInvoicePricing(
    { subtotal_amount: 300, late_fee_type: 'fixed', late_fee_fixed_amount: 0 },
    [{ daily_rate: 300, rental_days: 1 }],
  );
  assert.equal(computeLateFeePerDay(zeroFixed), 0);
});

test('fixed mode: exactly the configured amount, per late day', () => {
  const cfg = resolveInvoicePricing(
    { subtotal_amount: 300, late_fee_type: 'fixed', late_fee_fixed_amount: 100 },
    [{ daily_rate: 300, rental_days: 1 }],
  );
  assert.equal(computeLateFeePerDay(cfg), 100);
  // Total for N late days is N × per-day by definition (per-day fee).
  assert.equal(3 * computeLateFeePerDay(cfg), 300);
});

test('legacy multiplier rows keep their historical rendering (450 stays 450 THERE ONLY)', () => {
  // A pre-change invoice: daily 300, stored multiplier 1.5 → 450/day.
  // This is preserved so already-accepted contracts render unchanged —
  // but it is unreachable for NEW offers (wizard offers only
  // percentage/fixed and never writes 'multiplier').
  const legacy = resolveInvoicePricing(
    { subtotal_amount: 300, late_fee_type: 'multiplier', late_return_multiplier: 1.5 },
    [{ daily_rate: 300, rental_days: 1, replacement_value: 3000 }],
  );
  assert.equal(computeLateFeePerDay(legacy), 450);
});

test('the wizard can no longer produce a multiplier offer or a silent default', () => {
  const wizard = fsReadFileSync(new URL('../src/pages/merchant/MerchantRentalSession.tsx', import.meta.url), 'utf8');
  assert.ok(!wizard.includes("lateFeeType: 'multiplier'"), 'multiplier not issuable');
  assert.ok(!wizard.includes("lateReturnMultiplier: '1.5'"), 'no prefilled multiplier');
  assert.ok(!wizard.includes('clampLateMultiplier'), 'silent 1.5 clamp removed');
  assert.ok(wizard.includes("lateFeePercent: ''"), 'percentage starts EMPTY - merchant must choose');
  assert.ok(wizard.includes('lateExplainPercent') && wizard.includes('lateExplainFixed'),
    'calculation explanation shown in the UI');
  // Preview and stored payload flow through ONE config seam.
  assert.ok(wizard.includes('storedLateMultiplier(cfg)'));
});
import { readFileSync as fsReadFileSync } from 'node:fs';
