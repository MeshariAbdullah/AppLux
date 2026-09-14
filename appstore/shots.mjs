// =====================================================================
// Lend App Store campaign — THE single source of truth for both device
// sets (iPhone: render.mjs, 13" iPad: render-ipad.mjs). One messaging
// system, one order, one visual identity; the renderers only adapt
// canvas size and device framing.
//
// Six approved shots (headlines verbatim, one green phrase each,
// navy/beige alternation, Lend lockup on shot 1 only):
//   01 الثقة        /stores            استأجر بثقة. ووثّق حقك.
//   02 النظرة العامة /home              كل إيجاراتك في مكان واحد
//   03 المراجعة     /review            راجع العرض والعقد بوضوح
//   04 المتابعة     /track/contract    تابع إيجارك خطوة بخطوة
//   05 الضرر        /merchant/damages  إجراءات واضحة عند وجود ضرر
//   06 المتاجر      /merchant/rentals  إدارة الإيجارات للمحل بسهولة
//
// All content is the app's fictional seeded demo data — friendly
// references only, no invented features, no payment/guarantee claims.
// =====================================================================

// Fictional demo identities (customer session + approved merchant),
// stored in the demo store's own localStorage format.
export const SESSION = {
  fullName: 'سارة العتيبي', dob: '1994-03-01', mobile: '512345678',
  email: 'sara@example.com', city: 'riyadh', address: 'الرياض، حي الياسمين',
  profession: 'employee', employer: 'شركة الأفق', income: '14000',
  nafathVerified: false, createdAt: '2026-04-01T09:00:00.000Z',
};
export const MERCHANT = {
  id: 'm-demo-1', status: 'approved',
  companyName: 'ميزون دو سواريه', commercialReg: '1010456789',
  authorizedName: 'مشاعل القحطاني', authorizedId: '', iban: '',
  city: 'riyadh', address: 'الرياض — بوليفارد لكجري',
  contactEmail: 'hello@maison.example', contactPhone: '0550000000',
  branches: [], submittedAt: '2026-03-01T09:00:00.000Z',
  approvedAt: '2026-03-05T09:00:00.000Z', rejectedAt: null, rejectionReason: null,
};

/** The campaign. `device` is 'phone' | 'pad' — captures may adapt
 *  framing per device while staying the same screen and story. */
export function buildShots(APP, device) {
  return [
    {
      n: '01', bg: 'navy', lockup: true, statusBg: '#F5F5F0',
      headline: [[{ t: 'استأجر بثقة.' }], [{ t: 'ووثّق حقك.', green: true }]],
      sub: 'إيجارات موثقة من متاجر موثقة',
      source: '/stores — src/pages/Stores.tsx (verified partner stores)',
      capture: async (page) => {
        await page.goto(`${APP}/stores`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
      },
    },
    {
      n: '02', bg: 'beige', statusBg: '#F5F5F0',
      headline: [[{ t: 'كل إيجاراتك' }, { t: 'في مكان واحد', green: true }]],
      // Phone canvas: explicit break — the natural wrap widows «واحد».
      headlinePhone: [[{ t: 'كل إيجاراتك' }], [{ t: 'في مكان واحد', green: true }]],
      sub: 'العروض، والعقود، والحالة بخطوة واحدة',
      source: '/home — src/pages/Home.tsx (customer dashboard)',
      capture: async (page) => {
        await page.goto(`${APP}/home`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
      },
    },
    {
      n: '03', bg: 'navy', statusBg: '#FBFBF7',
      headline: [[{ t: 'راجع العرض والعقد' }, { t: 'بوضوح', green: true }]],
      sub: 'كل التفاصيل قبل ما توافق',
      source: '/review/RM-88231 step العرض — src/pages/Review.tsx',
      capture: async (page) => {
        await page.goto(`${APP}/review/RM-88231`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
      },
    },
    {
      n: '04', bg: 'beige', statusBg: '#FBFBF7',
      headline: [[{ t: 'تابع إيجارك' }, { t: 'خطوة بخطوة', green: true }]],
      sub: 'المواعيد والحالة والعقد الموثق',
      source: '/track/contract/LND-Q7F3KD — src/pages/ContractTracking.tsx',
      capture: async (page) => {
        await page.goto(`${APP}/track/contract/LND-Q7F3KD`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
        if (device === 'phone') {
          // Phone frame: lead with the journey timeline (the approved
          // iPhone framing); the taller iPad shows hero + journey from
          // the top of the page.
          await page.evaluate(() => {
            const main = document.querySelector('main');
            const label = [...main.querySelectorAll('*')]
              .find((e) => e.childElementCount === 0 && e.textContent.trim() === 'رحلة الإيجار');
            const card = label.closest('main > * > *') ?? label;
            main.scrollTo(0, card.getBoundingClientRect().top
              - main.getBoundingClientRect().top + main.scrollTop - 14);
          });
          await page.waitForTimeout(500);
        }
      },
    },
    {
      n: '05', bg: 'navy', statusBg: '#FBFBF7',
      headline: [[{ t: 'إجراءات واضحة' }, { t: 'عند وجود ضرر', green: true }]],
      // Phone canvas: explicit break — the natural wrap splits the
      // green phrase mid-way.
      headlinePhone: [[{ t: 'إجراءات واضحة' }], [{ t: 'عند وجود ضرر', green: true }]],
      sub: 'من البلاغ إلى التسوية بخطوات موثقة',
      source: '/merchant/damages — src/pages/merchant/MerchantDamages.tsx',
      capture: async (page) => {
        await page.goto(`${APP}/merchant/damages`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
      },
    },
    {
      n: '06', bg: 'beige', statusBg: '#F5F5F0',
      headline: [[{ t: 'إدارة الإيجارات للمحل' }, { t: 'بسهولة', green: true }]],
      sub: 'نظرة رقمية لعملياتك بدون ورق',
      source: '/merchant/rentals — src/pages/merchant/MerchantRentals.tsx',
      capture: async (page) => {
        await page.goto(`${APP}/merchant/rentals`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
      },
    },
  ];
}
