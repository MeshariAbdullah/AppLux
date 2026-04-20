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

const toneClass: Record<TimelineEventTone, { done: string; current: string; pending: string }> = {
  success: {
    done: 'bg-success-500 text-white ring-success-500/20',
    current: 'bg-success-500 text-white ring-success-500/30 shadow-[0_0_0_4px_rgba(26,175,114,0.15)]',
    pending: 'bg-success-50 text-success-600 ring-success-500/10',
  },
  brand: {
    done: 'bg-brand-500 text-white ring-brand-500/20',
    current: 'bg-brand-500 text-white ring-brand-500/30 shadow-[0_0_0_4px_rgba(46,110,240,0.15)]',
    pending: 'bg-brand-50 text-brand-600 ring-brand-500/10',
  },
  warn: {
    done: 'bg-warn-500 text-white ring-warn-500/25',
    current: 'bg-warn-500 text-white ring-warn-500/30 shadow-[0_0_0_4px_rgba(234,161,51,0.18)]',
    pending: 'bg-warn-50 text-warn-600 ring-warn-500/15',
  },
  danger: {
    done: 'bg-danger-500 text-white ring-danger-500/20',
    current: 'bg-danger-500 text-white ring-danger-500/30 shadow-[0_0_0_4px_rgba(229,72,77,0.15)]',
    pending: 'bg-danger-50 text-danger-600 ring-danger-500/10',
  },
  gold: {
    done: 'bg-gold-500 text-white ring-gold-500/25',
    current: 'bg-gold-500 text-white ring-gold-500/30 shadow-[0_0_0_4px_rgba(206,157,62,0.18)]',
    pending: 'bg-[#FBF2DD] text-gold-600 ring-gold-400/20',
  },
  neutral: {
    done: 'bg-ink-700 text-white ring-ink-200',
    current: 'bg-ink-900 text-white ring-ink-200',
    pending: 'bg-ink-100 text-ink-500 ring-ink-100',
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
                    'w-px flex-1 my-1 min-h-8 transition-colors',
                    e.state === 'done' ? 'bg-ink-200' : 'bg-ink-100',
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
