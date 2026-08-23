import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { gregorianLocale } from '@/lib/format/date';
import { ChevronIcon, ClockIcon } from '@/components/icons';
import { Select } from './FormField';

// =====================================================================
// GregorianDateTimeField — the in-app replacement for
// `<input type="datetime-local">`.
//
// A native date input delegates its calendar UI to the OS: an iPhone
// set to Arabic/Saudi with the Umm al-Qura calendar draws the picker
// wheel in HIJRI, which violates the product rule that the user must
// never see a Hijri calendar anywhere inside Lend. This component
// renders its own month grid, so the visible calendar is ALWAYS
// Gregorian — month names, day numbers, and year come from the pinned
// Gregorian locale tags in src/lib/format/date.ts, immune to the
// device's calendar setting. Time is chosen through plain <select>
// elements (native option wheels contain only the numbers we supply —
// no calendar involved).
//
// Value contract (identical to the native input it replaces):
// local-timezone "YYYY-MM-DDTHH:MM", no timezone suffix, minute
// granularity. Grid math uses Date fields (proleptic Gregorian per
// ECMA-262) — never locale-dependent parsing. No timezone shifts.
// =====================================================================

type Props = {
  /** Local "YYYY-MM-DDTHH:MM" (same contract as datetime-local). */
  value: string;
  onValueChange: (next: string) => void;
  locale: 'ar' | 'en';
  t: (key: string) => string;
  invalid?: boolean;
  /** Days strictly before this instant's LOCAL calendar day cannot be
   *  picked (mirror of the old `min` attribute; minute-level "past"
   *  validation stays with the caller, as before). */
  minMs?: number;
};

const VALUE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

function parseValue(value: string): Parts | null {
  const m = VALUE_RE.exec(value);
  if (!m) return null;
  const parts = {
    y: Number(m[1]),
    m: Number(m[2]) - 1,
    d: Number(m[3]),
    hh: Number(m[4]),
    mm: Number(m[5]),
  };
  const probe = new Date(parts.y, parts.m, parts.d, parts.hh, parts.mm);
  // Reject rollovers like Feb 30 — the serialized value must round-trip.
  if (
    probe.getFullYear() !== parts.y ||
    probe.getMonth() !== parts.m ||
    probe.getDate() !== parts.d
  ) {
    return null;
  }
  return parts;
}

const pad = (n: number) => String(n).padStart(2, '0');

function serialize(p: Parts): string {
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

export function GregorianDateTimeField({
  value,
  onValueChange,
  locale,
  t,
  invalid,
  minMs,
}: Props) {
  const tag = gregorianLocale(locale);
  const [open, setOpen] = useState(false);

  const selected = parseValue(value);
  const anchor = selected ?? {
    y: new Date().getFullYear(),
    m: new Date().getMonth(),
    d: new Date().getDate(),
    hh: new Date().getHours(),
    mm: new Date().getMinutes(),
  };
  // The month currently shown in the grid (may differ from selection
  // while browsing). Reset to the selection whenever the panel opens.
  const [view, setView] = useState<{ y: number; m: number }>({ y: anchor.y, m: anchor.m });

  const fmt = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }),
      monthTitle: new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: 'narrow' }),
      hour: new Intl.DateTimeFormat(tag, { hour: 'numeric', hour12: true }),
    }),
    [tag],
  );

  // Saudi weeks start on Sunday; English (en-GB) on Monday.
  const weekStart = locale === 'ar' ? 0 : 1;
  const weekdayLabels = useMemo(() => {
    // 2023-01-01 was a Sunday — a fixed anchor for weekday names.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.weekday.format(new Date(2023, 0, 1 + ((weekStart + i) % 7))),
    );
  }, [fmt, weekStart]);

  const hourLabels = useMemo(
    () => Array.from({ length: 24 }, (_, h) => fmt.hour.format(new Date(2023, 0, 1, h))),
    [fmt],
  );

  const daysInView = new Date(view.y, view.m + 1, 0).getDate();
  const leadingBlanks = (new Date(view.y, view.m, 1).getDay() - weekStart + 7) % 7;

  const minDayStart = useMemo(() => {
    if (minMs === undefined) return null;
    const d = new Date(minMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, [minMs]);

  const dayDisabled = (day: number) =>
    minDayStart !== null && new Date(view.y, view.m, day).getTime() < minDayStart;
  // Browsing back past the min month is pointless — every cell there
  // is disabled — so cap the prev chevron at the min month.
  const prevDisabled = (() => {
    if (minDayStart === null) return false;
    const min = new Date(minDayStart);
    return (
      view.y < min.getFullYear() ||
      (view.y === min.getFullYear() && view.m <= min.getMonth())
    );
  })();

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const next = new Date(v.y, v.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });

  const pick = (patch: Partial<Parts>) => onValueChange(serialize({ ...anchor, ...patch }));

  const displayText = selected
    ? fmt.full.format(new Date(selected.y, selected.m, selected.d, selected.hh, selected.mm))
    : t('common.datePicker.openLabel');

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('common.datePicker.openLabel')}
        onClick={() => {
          setOpen((o) => {
            if (!o) setView({ y: anchor.y, m: anchor.m });
            return !o;
          });
        }}
        className={cn(
          'flex w-full items-center gap-2.5 h-12 px-3.5 rounded-xl2 bg-white text-start',
          'shadow-hairline transition-shadow duration-200 ease-plush',
          'focus:outline-none focus:shadow-[0_0_0_2px_rgba(212,168,85,0.45),inset_0_0_0_1px_rgba(212,168,85,0.55)]',
          invalid &&
            'shadow-[0_0_0_1px_rgba(220,38,38,0.55)] focus:shadow-[0_0_0_2px_rgba(220,38,38,0.40),inset_0_0_0_1px_rgba(220,38,38,0.55)]',
        )}
      >
        <span className="text-ink-400 shrink-0">
          <ClockIcon size={16} />
        </span>
        <span
          className={cn(
            'flex-1 min-w-0 truncate text-[14.5px] num',
            selected ? 'text-ink-900' : 'text-ink-300',
          )}
        >
          {displayText}
        </span>
        <span className={cn('text-ink-400 shrink-0 transition-transform', open && 'rotate-90')}>
          <ChevronIcon size={14} className="rtl:rotate-180" />
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl2 bg-white shadow-hairline p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={t('common.datePicker.prevMonth')}
              onClick={() => shiftMonth(-1)}
              disabled={prevDisabled}
              className="h-8 w-8 grid place-items-center rounded-lg text-ink-500 hover:bg-canvas-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronIcon size={15} className="rotate-180 rtl:rotate-0" />
            </button>
            <div className="text-[13.5px] font-semibold text-ink-900 num">
              {fmt.monthTitle.format(new Date(view.y, view.m, 1))}
            </div>
            <button
              type="button"
              aria-label={t('common.datePicker.nextMonth')}
              onClick={() => shiftMonth(1)}
              className="h-8 w-8 grid place-items-center rounded-lg text-ink-500 hover:bg-canvas-100"
            >
              <ChevronIcon size={15} className="rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {weekdayLabels.map((w, i) => (
              <div key={`w${i}`} className="text-[10.5px] font-semibold text-ink-400 pb-1">
                {w}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: daysInView }, (_, i) => {
              const day = i + 1;
              const isSelected =
                selected !== null &&
                selected.y === view.y &&
                selected.m === view.m &&
                selected.d === day;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={dayDisabled(day)}
                  aria-pressed={isSelected}
                  onClick={() => pick({ y: view.y, m: view.m, d: day })}
                  className={cn(
                    'h-9 rounded-lg text-[13px] num transition-colors',
                    isSelected
                      ? 'bg-gold-500 text-white font-semibold'
                      : 'text-ink-800 hover:bg-canvas-100',
                    'disabled:text-ink-200 disabled:hover:bg-transparent disabled:cursor-not-allowed',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="pt-1 space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              {t('common.datePicker.time')}
            </div>
            <div className="flex items-center gap-2">
              <Select
                aria-label={t('common.datePicker.hour')}
                value={String(anchor.hh)}
                onChange={(e) => pick({ hh: Number(e.target.value) })}
                className="num"
              >
                {hourLabels.map((label, h) => (
                  <option key={h} value={h}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={t('common.datePicker.minute')}
                value={String(anchor.mm)}
                onChange={(e) => pick({ mm: Number(e.target.value) })}
                className="num"
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={m}>
                    {pad(m)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full h-10 rounded-xl2 bg-canvas-100 text-[13px] font-semibold text-ink-800 hover:bg-canvas-200 transition-colors"
          >
            {t('common.datePicker.done')}
          </button>
        </div>
      )}
    </div>
  );
}
