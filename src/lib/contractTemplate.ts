// =====================================================================
// Contract template — turns a real invoice + items + merchant into the
// localized contract clauses + damage policy shown in the customer's
// Review wizard, Approval screen, and Contract tracking page.
//
// Goal: the contract is NOT a separate document the customer has to
// chase. It's the terms of the offer, generated from a fixed template
// on the platform and rendered as part of the same review thread.
//
// Inputs (real values from the invoice + items + merchant rows):
//   * rental period (start / end / days)
//   * rental fee + tax + security deposit
//   * item replacement value (drives damage policy)
//   * daily rate (drives late-return penalty)
//   * merchant name
//
// Output:
//   * clauses[]  — { label, body } pairs in both Arabic and English
//   * damages    — partialDamage (≈ 30% of replacement), totalDamage
//                  (= replacement), nonReturn (= replacement), with a
//                  short policy note.
//
// The fractions and policy text live here as named constants so a
// product change can update one file without re-deriving the math at
// every render site.
// =====================================================================

import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import type {
  ContractClause,
  Localized,
  ScannedPackage,
} from './data';
import type {
  MerchantRow,
  RentalInvoiceItemRow,
  RentalInvoiceRow,
} from './supabase';

// Defaults — used when the merchant didn't override these in the
// contract preparation step. The current source of truth is the
// invoice row's light_damage_fraction + late_return_multiplier
// columns; these are the fallback for older rows or callers that
// don't pass overrides.
export const DEFAULT_LIGHT_DAMAGE_FRACTION = 0.30;
export const DEFAULT_LATE_RETURN_MULTIPLIER = 1.5;

const SAR = (n: number) =>
  `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} SAR`;
// Latin (English) numerals in the Arabic contract text by product rule
// — 'ar-EG' would render ٧٥ where the approved copy shows 75.
const SARAr = (n: number) =>
  `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`;

function fmtDateAr(iso: string): string {
  // -u-nu-latn: Arabic (Gregorian) month names with Latin digits.
  return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
function fmtDateEn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** 'HH:MM[:SS]' (merchant_branches.hours_open/close) → 12-hour label
 *  with Latin digits — 'م/ص' in Arabic, 'PM/AM' in English. */
function fmtTime(t: string, lang: 'ar' | 'en'): string {
  const [hRaw, mRaw] = t.split(':');
  let h = Number(hRaw);
  const m = mRaw ?? '00';
  const pm = h >= 12;
  h = h % 12 || 12;
  const suffix = lang === 'ar' ? (pm ? 'م' : 'ص') : pm ? 'PM' : 'AM';
  return `${h}:${m} ${suffix}`;
}

/** Operating-hours label shared by the rental-period clause and the
 *  PDF export — null when either bound is missing (never invented). */
export function formatOperatingHoursLabel(
  open: string | null | undefined,
  close: string | null | undefined,
  lang: 'ar' | 'en',
): string | null {
  if (!open || !close) return null;
  return lang === 'ar'
    ? `من ${fmtTime(open, 'ar')} إلى ${fmtTime(close, 'ar')}`
    : `${fmtTime(open, 'en')} – ${fmtTime(close, 'en')}`;
}

/** Arabic count-noun agreement for the rental duration; English digits
 *  stay Latin in both languages (product rule). */
function durationAr(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days >= 3 && days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}
function durationEn(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

type TemplateInputs = {
  invoice: RentalInvoiceRow;
  items: RentalInvoiceItemRow[];
  merchant: MerchantRow | null | undefined;
  pickupDate: string;
  returnDate: string;
  durationDays: number;
  /** Merchant-controlled override for the light damage liability. If
   *  omitted, falls back to invoice.light_damage_fraction, then to
   *  DEFAULT_LIGHT_DAMAGE_FRACTION. */
  lightDamageFraction?: number;
  /** Merchant-controlled override for the late-return multiplier. If
   *  omitted, falls back to invoice.late_return_multiplier, then to
   *  DEFAULT_LATE_RETURN_MULTIPLIER. */
  lateReturnMultiplier?: number;
  /** Pickup branch operating hours (merchant_branches.hours_open /
   *  hours_close). When BOTH are present the rental-period clause
   *  states the actual hours; otherwise it uses the general "خلال
   *  أوقات عمل التاجر" wording. Never invented. */
  branchHours?: { open: string | null; close: string | null } | null;
};

export type ContractTemplateOutput = {
  clauses: ContractClause[];
  damages: ScannedPackage['damages'];
};

export function buildContractFromTemplate({
  invoice,
  items,
  merchant,
  pickupDate,
  returnDate,
  durationDays,
  lightDamageFraction,
  lateReturnMultiplier,
  branchHours,
}: TemplateInputs): ContractTemplateOutput {
  const lightFrac =
    lightDamageFraction ??
    (typeof invoice.light_damage_fraction === 'number'
      ? Number(invoice.light_damage_fraction)
      : DEFAULT_LIGHT_DAMAGE_FRACTION);
  const lateMult =
    lateReturnMultiplier ??
    (typeof invoice.late_return_multiplier === 'number'
      ? Number(invoice.late_return_multiplier)
      : DEFAULT_LATE_RETURN_MULTIPLIER);
  const totalReplacement = items.reduce(
    (s, it) => s + Number(it.replacement_value ?? 0),
    0,
  );
  const lightDamage = Math.round(totalReplacement * lightFrac);
  const dailyRate = items[0]?.daily_rate ? Number(items[0].daily_rate) : 0;
  const latePerDay = Math.round(dailyRate * lateMult);
  const rentalFee = Number(invoice.subtotal_amount);
  const deposit = Number(invoice.security_deposit);
  const total = Number(invoice.total_amount);

  // NOTE: the lessor is a contracting PARTY, not a contract term — its
  // identity lives in the الأطراف section (with the CR number since
  // 20260502123500), never in this clause list.
  const clauses: ContractClause[] = [
    {
      id: 'period',
      title: { ar: 'فترة الإيجار', en: 'Rental period' },
      body: {
        ar: `من ${fmtDateAr(pickupDate)} إلى ${fmtDateAr(returnDate)} (${durationAr(durationDays)})، على أن يتم الاستلام والإرجاع خلال أوقات عمل التاجر${
          branchHours?.open && branchHours?.close
            ? ` (من ${fmtTime(branchHours.open, 'ar')} إلى ${fmtTime(branchHours.close, 'ar')})`
            : ''
        }.`,
        en: `From ${fmtDateEn(pickupDate)} to ${fmtDateEn(returnDate)} (${durationEn(durationDays)}), with pickup and return completed during the merchant's operating hours${
          branchHours?.open && branchHours?.close
            ? ` (${fmtTime(branchHours.open, 'en')} – ${fmtTime(branchHours.close, 'en')})`
            : ''
        }.`,
      },
    },
    {
      id: 'fee',
      title: { ar: 'رسوم الإيجار', en: 'Rental fee' },
      // Current phase (ENABLE_PAYMENTS_AND_NOTES = false): neutral
      // wording that states the rental value only — no payment
      // mechanism, timing, or destination is implied. The legacy
      // "payable before pickup" wording is preserved for restoration.
      body: ENABLE_PAYMENTS_AND_NOTES
        ? {
            ar: `${SARAr(rentalFee)} (الإجمالي مع الضريبة: ${SARAr(total)}). تُسدَّد قبل الاستلام.`,
            en: `${SAR(rentalFee)} (incl. VAT: ${SAR(total)}). Payable before pickup.`,
          }
        : {
            ar: `قيمة الإيجار: ${SARAr(rentalFee)}، والإجمالي شامل الضريبة: ${SARAr(total)}.`,
            en: `Rental value: ${SAR(rentalFee)}. Total including VAT: ${SAR(total)}.`,
          },
    },
    ...(deposit > 0
      ? [
          {
            id: 'deposit',
            title: { ar: 'مبلغ التأمين', en: 'Security deposit' },
            body: {
              ar: `${SARAr(deposit)} يُستردّ بعد إعادة القطعة سليمة.`,
              en: `${SAR(deposit)} refundable on safe return.`,
            },
          },
        ]
      : []),
    {
      id: 'light-damage',
      title: { ar: 'الضرر الجزئي (الخفيف)', en: 'Light damage' },
      body: {
        ar: `يلتزم المستأجر بدفع ما يعادل ${SARAr(lightDamage)} (${Math.round(lightFrac * 100)}% من قيمة القطعة) لتغطية الأضرار البسيطة كالبقع أو الخدوش الخفيفة.`,
        en: `Lessee is liable for up to ${SAR(lightDamage)} (${Math.round(lightFrac * 100)}% of the item value) covering minor damages such as stains or light scuffs.`,
      },
    },
    {
      id: 'full-damage',
      title: { ar: 'الضرر الكلي', en: 'Full damage' },
      body: {
        ar: `في حالة الضرر الكلي أو فقدان القطعة، يلتزم المستأجر بسداد القيمة الكاملة للقطعة وقدرها ${SARAr(totalReplacement)}.`,
        en: `In case of total damage or loss, lessee is liable for the full item value of ${SAR(totalReplacement)}.`,
      },
    },
    {
      id: 'late-return',
      title: { ar: 'التأخّر في الإرجاع', en: 'Late return' },
      body: {
        ar: `يُحتسب التأخر بعد انتهاء موعد الإرجاع المتفق عليه، مع مراعاة أوقات فتح وإغلاق التاجر. ويُحتسب عن كل يوم تأخير مبلغ ${SARAr(latePerDay)} (${lateMult}× السعر اليومي)، بحد أقصى قيمة القطعة الكاملة.`,
        en: `Late return is calculated after the agreed return deadline, taking the merchant's opening and closing hours into account. A fee of ${SAR(latePerDay)} per delayed day (${lateMult}× the daily rate) applies, capped at the full value of the item.`,
      },
    },
    {
      id: 'cancellation',
      title: { ar: 'الإلغاء', en: 'Cancellation' },
      body: {
        ar: 'يمكن إلغاء الطلب قبل الاستلام دون رسوم. لا إلغاء بعد الاستلام.',
        en: 'Cancellation is free before pickup. No cancellation after pickup.',
      },
    },
    // Promissory-note clause — OMITTED ENTIRELY in the current phase
    // (ENABLE_PAYMENTS_AND_NOTES = false): no note exists, so the
    // customer-approved contract must not bind one. The clause text is
    // preserved here for flag restoration.
    ...(ENABLE_PAYMENTS_AND_NOTES
      ? [
          {
            id: 'note',
            title: { ar: 'سند الأمر', en: 'Promissory note' },
            body: {
              ar: 'يُنشأ السند تلقائياً بعد الدفع، ويُوقَّع عبر نفاذ خارج التطبيق. يصبح ملزماً عند تأكيد Lend.',
              en: 'The promissory note is generated after payment and signed via Nafath outside the app. It becomes binding once Lend verifies.',
            },
          },
        ]
      : []),
  ];

  return {
    clauses,
    damages: {
      nonReturn: totalReplacement,
      partialDamage: lightDamage,
      totalDamage: totalReplacement,
      note: {
        ar: `يُحتسب الضرر الخفيف بنسبة ${Math.round(lightFrac * 100)}% من قيمة القطعة. التأخّر في الإرجاع: ${SARAr(latePerDay)} عن كل يوم.`,
        en: `Light damage is ${Math.round(lightFrac * 100)}% of the item value. Late return: ${SAR(latePerDay)} per day.`,
      },
    },
  };
}
