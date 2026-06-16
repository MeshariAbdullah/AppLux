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

// Light damage = 30% of full replacement value. A merchant-facing
// override may land later; the constant keeps the default in one place.
const LIGHT_DAMAGE_FRACTION = 0.30;
// Late return penalty = 1.5× the daily rate per day overdue.
const LATE_RETURN_MULTIPLIER = 1.5;

const SAR = (n: number) =>
  `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} SAR`;
const SARAr = (n: number) =>
  `${n.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ر.س`;

function fmtDateAr(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', {
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

type TemplateInputs = {
  invoice: RentalInvoiceRow;
  items: RentalInvoiceItemRow[];
  merchant: MerchantRow | null | undefined;
  pickupDate: string;
  returnDate: string;
  durationDays: number;
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
}: TemplateInputs): ContractTemplateOutput {
  const totalReplacement = items.reduce(
    (s, it) => s + Number(it.replacement_value ?? 0),
    0,
  );
  const lightDamage = Math.round(totalReplacement * LIGHT_DAMAGE_FRACTION);
  const dailyRate = items[0]?.daily_rate ? Number(items[0].daily_rate) : 0;
  const latePerDay = Math.round(dailyRate * LATE_RETURN_MULTIPLIER);
  const merchantName: Localized = merchant?.display_name
    ? {
        ar: merchant.display_name.ar || merchant.display_name.en || '',
        en: merchant.display_name.en || merchant.display_name.ar || '',
      }
    : { ar: 'شريك Lend', en: 'Lend Partner' };

  const rentalFee = Number(invoice.subtotal_amount);
  const deposit = Number(invoice.security_deposit);
  const total = Number(invoice.total_amount);

  const clauses: ContractClause[] = [
    {
      id: 'lessor',
      title: { ar: 'المؤجِّر', en: 'Lessor' },
      body: {
        ar: merchantName.ar,
        en: merchantName.en,
      },
    },
    {
      id: 'period',
      title: { ar: 'فترة الإيجار', en: 'Rental period' },
      body: {
        ar: `من ${fmtDateAr(pickupDate)} إلى ${fmtDateAr(returnDate)} (${durationDays} يوماً).`,
        en: `From ${fmtDateEn(pickupDate)} to ${fmtDateEn(returnDate)} (${durationDays} days).`,
      },
    },
    {
      id: 'fee',
      title: { ar: 'رسوم الإيجار', en: 'Rental fee' },
      body: {
        ar: `${SARAr(rentalFee)} (الإجمالي مع الضريبة: ${SARAr(total)}). تُسدَّد قبل الاستلام.`,
        en: `${SAR(rentalFee)} (incl. VAT: ${SAR(total)}). Payable before pickup.`,
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
        ar: `يلتزم المستأجر بدفع ما يعادل ${SARAr(lightDamage)} (30% من قيمة القطعة) لتغطية الأضرار البسيطة كالبقع أو الخدوش الخفيفة.`,
        en: `Lessee is liable for up to ${SAR(lightDamage)} (30% of the item value) covering minor damages such as stains or light scuffs.`,
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
        ar: `يُحتسب على كل يوم تأخّر مبلغ ${SARAr(latePerDay)} (1.5× السعر اليومي)، بحد أقصى قيمة القطعة الكاملة.`,
        en: `Each day late incurs ${SAR(latePerDay)} (1.5× the daily rate), capped at the full item value.`,
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
    {
      id: 'note',
      title: { ar: 'سند الأمر', en: 'Promissory note' },
      body: {
        ar: 'يُنشأ السند تلقائياً بعد الدفع، ويُوقَّع عبر نفاذ خارج التطبيق. يصبح ملزماً عند تأكيد Lend.',
        en: 'The promissory note is generated after payment and signed via Nafath outside the app. It becomes binding once Lend verifies.',
      },
    },
  ];

  return {
    clauses,
    damages: {
      nonReturn: totalReplacement,
      partialDamage: lightDamage,
      totalDamage: totalReplacement,
      note: {
        ar: `يُحتسب الضرر الخفيف بنسبة 30% من قيمة القطعة. التأخّر في الإرجاع: ${SARAr(latePerDay)} عن كل يوم.`,
        en: `Light damage is 30% of the item value. Late return: ${SAR(latePerDay)} per day.`,
      },
    },
  };
}
