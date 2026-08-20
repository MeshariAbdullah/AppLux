// =====================================================================
// Gregorian-only date formatting — THE shared locale source for every
// date shown anywhere in Lend (UI, PDFs, timelines).
//
// Product rule: ALL dates are Gregorian, in both languages. Arabic UI
// shows Arabic TEXT on the Gregorian calendar ("20 أغسطس 2026"), never
// Hijri — regardless of the device's region or calendar setting.
//
// Why the explicit `-u-ca-gregory` matters: a bare 'ar-SA' locale lets
// the runtime pick the region's default calendar. On iOS (and any ICU
// build predating Saudi Arabia's CLDR switch to Gregorian-first), that
// default is Islamic-umalqura — a device set to Arabic/Saudi with the
// Umm al-Qura calendar renders "٢٨ صفر ١٤٤٨ هـ". Pinning the calendar
// in the locale tag overrides both the region default and the device
// calendar setting on every engine.
//
// Digits: `-u-nu-latn` keeps Latin digits inside Arabic dates — the
// app-wide contract rule (matches the contract PDF and offer-expiry
// copy: "20 أغسطس 2026", not "٢٠ أغسطس ٢٠٢٦").
//
// Timezone: deliberately untouched — formatting stays in the device's
// local zone exactly as before; this module only pins calendar/digits.
// =====================================================================

/** Arabic, Gregorian calendar, Arabic month names, Latin digits. */
export const GREGORIAN_LOCALE_AR = 'ar-EG-u-ca-gregory-nu-latn';

/** English, Gregorian calendar — "20 Aug 2026" day-first style. */
export const GREGORIAN_LOCALE_EN = 'en-GB-u-ca-gregory';

/** BCP-47 tag with the Gregorian calendar pinned, per app locale. */
export function gregorianLocale(locale: 'ar' | 'en'): string {
  return locale === 'ar' ? GREGORIAN_LOCALE_AR : GREGORIAN_LOCALE_EN;
}

/** Format a date on the pinned Gregorian calendar.
 *  Defaults to `dateStyle: 'medium'` when no options are given. */
export function formatGregorian(
  locale: 'ar' | 'en',
  d: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(
    gregorianLocale(locale),
    opts ?? { dateStyle: 'medium' },
  ).format(new Date(d));
}
