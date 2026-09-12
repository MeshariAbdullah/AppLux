// =====================================================================
// Rental pricing + penalty math — the ONE place these formulas live.
// Consumed by the merchant issuance wizard (previews + payload), the
// contract template (customer review / contract record / PDFs render
// its output), and anything else that needs an amount derived from an
// offer's terms. Never re-derive these in a component.
//
// Dependency-free and pure on purpose so it can be bundled standalone
// for Node unit tests (scripts/pricing.test.mjs — same pattern as the
// other shared validators).
//
// Backward compatibility is centralized in resolveInvoicePricing():
// rows created before 20260502125300 have no config columns and are
// treated as
//   pricing_type = 'daily', damage_charge_type = 'percentage',
//   late_fee_type = 'multiplier'
// which reproduces the pre-migration behavior exactly.
// =====================================================================

export type PricingType = 'daily' | 'total';
export type DamageChargeType = 'percentage' | 'fixed';
// 'percentage' and 'fixed' are the two modes new offers can use
// (20260502130100): percentage of the RENTAL PRICE per late day, or a
// fixed SAR amount per late day. 'multiplier' (daily rate × factor)
// exists ONLY so contracts issued before the change keep rendering
// their historical values — the wizard no longer offers it.
export type LateFeeType = 'multiplier' | 'fixed' | 'percentage';

export const DEFAULT_LIGHT_DAMAGE_FRACTION = 0.3;
export const DEFAULT_LATE_RETURN_MULTIPLIER = 1.5;

export type PricingConfig = {
  pricingType: PricingType;
  /** Daily rate (SAR). Meaningful only when pricingType = 'daily'. */
  dailyRate: number;
  /** Rental DURATION in days — always the duration, never an amount
   *  driver in 'total' mode. */
  rentalDays: number;
  /** Merchant-entered total rental amount (SAR). Meaningful only when
   *  pricingType = 'total'. */
  totalAmount: number;
  /** Item value (SAR) — the base for percentage damage. */
  itemValue: number;
  damageChargeType: DamageChargeType;
  /** Fraction in (0,1]. Meaningful only in 'percentage' mode. */
  lightDamageFraction: number;
  /** SAR. Meaningful only in damage 'fixed' mode. */
  damageFixedAmount: number;
  lateFeeType: LateFeeType;
  /** × of the daily rate. Meaningful only in the LEGACY 'multiplier'
   *  mode (pre-20260502130100 offers). */
  lateReturnMultiplier: number;
  /** Percent (0..100) of the RENTAL PRICE per late day. Meaningful
   *  only in 'percentage' mode. Merchant-entered — never defaulted. */
  lateFeePercent: number;
  /** SAR per late day. Meaningful only in late 'fixed' mode. */
  lateFeeFixedAmount: number;
};

/** Total rental amount for the offer.
 *  daily → daily rate × days; total → the entered total, untouched. */
export function computeRentalTotal(cfg: PricingConfig): number {
  if (cfg.pricingType === 'total') return Math.max(cfg.totalAmount, 0);
  const days = Math.max(cfg.rentalDays, 1);
  return Math.max(cfg.dailyRate, 0) * days;
}

/** Light-damage liability.
 *  percentage → item value × fraction (rounded, legacy behavior);
 *  fixed → the entered SAR amount, untouched. */
export function computeLightDamageCharge(cfg: PricingConfig): number {
  if (cfg.damageChargeType === 'fixed') return Math.max(cfg.damageFixedAmount, 0);
  return Math.round(Math.max(cfg.itemValue, 0) * cfg.lightDamageFraction);
}

/** Fee per LATE DAY — exactly the merchant's configured rule:
 *  fixed      → the entered SAR amount, untouched (0 stays 0);
 *  percentage → rental price × the entered percent (0 stays 0 — no
 *               hidden default is ever injected);
 *  multiplier → LEGACY (pre-20260502130100 rows only): daily rate ×
 *               multiplier, preserved verbatim so historical contracts
 *               keep rendering their stored terms; odd legacy data
 *               combining it with 'total' pricing uses the average
 *               daily base (total ÷ days) so the clause never
 *               silently renders 0. */
export function computeLateFeePerDay(cfg: PricingConfig): number {
  if (cfg.lateFeeType === 'fixed') return Math.max(cfg.lateFeeFixedAmount, 0);
  if (cfg.lateFeeType === 'percentage') {
    return Math.round(computeRentalTotal(cfg) * (Math.max(cfg.lateFeePercent, 0) / 100));
  }
  const base =
    cfg.pricingType === 'total'
      ? Math.max(cfg.totalAmount, 0) / Math.max(cfg.rentalDays, 1)
      : Math.max(cfg.dailyRate, 0);
  return Math.round(base * cfg.lateReturnMultiplier);
}

// ---------------------------------------------------------------------
// Invoice → config (backward-compatible resolution)
// ---------------------------------------------------------------------

/** The subset of rental_invoices (+ items) the resolver reads. Nullable
 *  and optional so rows from before 20260502125300 resolve cleanly. */
export type InvoicePricingSource = {
  pricing_type?: string | null;
  subtotal_amount: number | string;
  light_damage_fraction?: number | string | null;
  late_return_multiplier?: number | string | null;
  damage_charge_type?: string | null;
  damage_fixed_amount?: number | string | null;
  late_fee_type?: string | null;
  late_fee_fixed_amount?: number | string | null;
};

export type InvoiceItemPricingSource = {
  daily_rate: number | string;
  rental_days: number;
  replacement_value?: number | string | null;
};

const num = (v: number | string | null | undefined, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

/**
 * Resolves an invoice row + its items into a PricingConfig. This is
 * THE backward-compatibility seam: missing/unknown type columns fall
 * back to the legacy behaviors ('daily' / 'percentage' / 'multiplier').
 */
export function resolveInvoicePricing(
  invoice: InvoicePricingSource,
  items: InvoiceItemPricingSource[],
): PricingConfig {
  const pricingType: PricingType =
    invoice.pricing_type === 'total' ? 'total' : 'daily';
  const damageChargeType: DamageChargeType =
    invoice.damage_charge_type === 'fixed' ? 'fixed' : 'percentage';
  const lateFeeType: LateFeeType =
    invoice.late_fee_type === 'fixed'
      ? 'fixed'
      : invoice.late_fee_type === 'percentage'
        ? 'percentage'
        : 'multiplier';
  const rentalDays = items.length
    ? Math.max(...items.map((it) => it.rental_days || 0)) || 1
    : 1;
  return {
    pricingType,
    dailyRate: num(items[0]?.daily_rate),
    rentalDays,
    // The stored subtotal IS the rental amount under both models — in
    // 'daily' mode the wizard wrote rate × days there; in 'total' mode
    // it wrote the entered total.
    totalAmount: num(invoice.subtotal_amount),
    itemValue: items.reduce((s, it) => s + num(it.replacement_value), 0),
    damageChargeType,
    lightDamageFraction: num(
      invoice.light_damage_fraction,
      DEFAULT_LIGHT_DAMAGE_FRACTION,
    ),
    damageFixedAmount: num(invoice.damage_fixed_amount),
    lateFeeType,
    lateReturnMultiplier: num(
      invoice.late_return_multiplier,
      DEFAULT_LATE_RETURN_MULTIPLIER,
    ),
    // 'percentage' rows store the FRACTION in late_return_multiplier
    // (0.2 = 20%); resolved to percent with NO fallback — an absent
    // value yields 0, never an invented rate (the DB constraint
    // requires (0,1] for percentage rows anyway).
    lateFeePercent:
      lateFeeType === 'percentage' ? num(invoice.late_return_multiplier) * 100 : 0,
    lateFeeFixedAmount: num(invoice.late_fee_fixed_amount),
  };
}
