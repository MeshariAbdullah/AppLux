import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';

export type TimelineEventTone = 'success' | 'brand' | 'warn' | 'danger' | 'neutral' | 'gold';
export type TimelineEventState = 'done' | 'current' | 'pending';

export type TimelineEvent = {
  id: string;
  label: ReactNode;
  at?: string | null;
  description?: ReactNode;
  icon: ReactNode;
  tone: TimelineEventTone;
  state: TimelineEventState;
  badge?: ReactNode;
};

// Calmer dot palette — one shared champagne gold for "complete" so the
// whole journey reads as a single elegant progression rather than a
// rainbow. Only `current` keeps a soft halo to draw the eye.
const toneClass: Record<TimelineEventTone, { done: string; current: string; pending: string }> = {
  success: {
    done: 'bg-gold-400 text-ink-950 ring-gold-100',
    current: 'bg-ink-900 text-white ring-gold-100 shadow-[0_0_0_4px_rgba(212,168,85,0.18)]',
    pending: 'bg-canvas-100 text-ink-400 ring-canvas-200',
  },
  brand: {
    done: 'bg-gold-400 text-ink-950 ring-gold-100',
    current: 'bg-ink-900 text-white ring-gold-100 shadow-[0_0_0_4px_rgba(212,168,85,0.18)]',
    pending: 'bg-canvas-100 text-ink-400 ring-canvas-200',
  },
  warn: {
    done: 'bg-warn-500 text-white ring-warn-50',
    current: 'bg-warn-500 text-white ring-warn-50 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]',
    pending: 'bg-warn-50 text-warn-700 ring-warn-50',
  },
  danger: {
    done: 'bg-danger-500 text-white ring-danger-50',
    current: 'bg-danger-500 text-white ring-danger-50 shadow-[0_0_0_4px_rgba(220,38,38,0.18)]',
    pending: 'bg-danger-50 text-danger-700 ring-danger-50',
  },
  gold: {
    done: 'bg-gold-400 text-ink-950 ring-gold-100',
    current: 'bg-ink-900 text-white ring-gold-100 shadow-[0_0_0_4px_rgba(212,168,85,0.18)]',
    pending: 'bg-gold-50 text-gold-700 ring-gold-50',
  },
  neutral: {
    done: 'bg-ink-700 text-white ring-canvas-200',
    current: 'bg-ink-900 text-white ring-canvas-200',
    pending: 'bg-canvas-100 text-ink-400 ring-canvas-200',
  },
};

export function DocTimeline({ events }: { events: TimelineEvent[] }) {
  const { formatDate } = useI18n();
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        const classes = toneClass[e.tone][e.state];
        return (
          <li key={e.id} className="flex items-start gap-3 relative">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'h-9 w-9 rounded-full grid place-items-center shrink-0 ring-2 transition-colors',
                  classes,
                )}
              >
                {e.icon}
              </span>
              {!isLast && (
                <span
                  className={cn(
                    'w-px flex-1 my-1 min-h-9 transition-colors',
                    e.state === 'done' ? 'bg-gold-200' : 'bg-canvas-200',
                  )}
                />
              )}
            </div>
            <div className={cn('flex-1 min-w-0', !isLast && 'pb-5')}>
              <div className="flex items-start gap-2 flex-wrap">
                <div
                  className={cn(
                    'text-[13.5px] font-semibold truncate',
                    e.state === 'pending' ? 'text-ink-500' : 'text-ink-900',
                  )}
                >
                  {e.label}
                </div>
                {e.badge}
              </div>
              {e.at && (
                <div className="mt-0.5 text-[11.5px] text-ink-400 num">
                  {formatDate(e.at, { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              )}
              {e.description && (
                <div className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
                  {e.description}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
