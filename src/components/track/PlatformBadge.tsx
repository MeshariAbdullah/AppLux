import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BadgeCheckIcon, ClockIcon, GavelIcon, ShieldIcon } from '@/components/icons';
import { StatusChip, type StatusTone } from '@/components/ui';

export type Platform = 'nafath' | 'nafith' | 'execution';
type PlatformState = 'verified' | 'pending' | 'escalated';

const styles: Record<Platform, { icon: ReactNode; bg: string; ring: string; text: string }> = {
  nafath: {
    icon: <ShieldIcon size={18} />,
    bg: 'bg-ink-900 text-white',
    ring: 'ring-white/15',
    text: 'text-white/75',
  },
  nafith: {
    icon: <BadgeCheckIcon size={18} />,
    bg: 'bg-ink-900 text-white',
    ring: 'ring-white/15',
    text: 'text-white/75',
  },
  execution: {
    icon: <GavelIcon size={18} />,
    bg: 'bg-danger-500/95 text-white',
    ring: 'ring-white/20',
    text: 'text-white/85',
  },
};

const stateTone: Record<PlatformState, StatusTone> = {
  verified: 'success',
  pending: 'warn',
  escalated: 'danger',
};

type Props = {
  platform: Platform;
  state?: PlatformState;
  title: ReactNode;
  description: ReactNode;
  stateLabel: ReactNode;
  meta?: ReactNode;
};

export function PlatformBadge({ platform, state = 'verified', title, description, stateLabel, meta }: Props) {
  const s = styles[platform];
  return (
    <div className={cn('rounded-xl2 px-4 py-3.5 flex items-start gap-3', s.bg)}>
      <span className={cn('h-10 w-10 shrink-0 rounded-xl bg-white/10 ring-1 grid place-items-center', s.ring)}>
        {s.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold">{title}</span>
          <StatusChip size="sm" tone={stateTone[state]} dot label={stateLabel} />
        </div>
        <div className={cn('mt-0.5 text-[12px] leading-relaxed', s.text)}>{description}</div>
        {meta && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-white/60 num">
            <ClockIcon size={12} />
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}
