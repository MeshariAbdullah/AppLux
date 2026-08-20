import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';
import { gregorianLocale } from '@/lib/format/date';

export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

type Dict = typeof ar;
const dictionaries: Record<Locale, Dict> = { ar, en };

const STORAGE_KEY = 'applux.locale';
const DEFAULT_LOCALE: Locale = 'ar';

type I18nContextValue = {
  locale: Locale;
  dir: Direction;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatCurrency: (n: number) => string;
  formatDate: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveKey(dict: Dict, key: string): string | undefined {
  const parts = key.split('.');
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'ar' || stored === 'en' ? stored : DEFAULT_LOCALE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const dir: Direction = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* storage unavailable */
    }
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const toggleLocale = useCallback(
    () => setLocaleState((prev) => (prev === 'ar' ? 'en' : 'ar')),
    [],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale];
      const fallback = dictionaries.en;
      const value = resolveKey(dict, key) ?? resolveKey(fallback, key) ?? key;
      return interpolate(value, vars);
    },
    [locale],
  );

  const intlLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  const formatNumber = useCallback(
    (n: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(intlLocale, opts).format(n),
    [intlLocale],
  );

  const formatCurrency = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency: 'SAR',
        maximumFractionDigits: 0,
      }).format(n),
    [intlLocale],
  );

  // Dates NEVER use `intlLocale`: bare 'ar-SA' resolves to the Islamic
  // (Hijri) calendar on iOS/older ICU. Product rule is Gregorian-only
  // in both languages — see src/lib/format/date.ts.
  const formatDate = useCallback(
    (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(gregorianLocale(locale), opts ?? { dateStyle: 'medium' }).format(
        new Date(d),
      ),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir, t, setLocale, toggleLocale, formatNumber, formatCurrency, formatDate }),
    [locale, dir, t, setLocale, toggleLocale, formatNumber, formatCurrency, formatDate],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
