import type { ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { cn } from '@/lib/cn';

type Tone = 'danger' | 'warn' | 'brand' | 'success' | 'gold';

const toneClass: Record<Tone, string> = {
  danger: 'bg-danger-50 text-danger-700',
  warn: 'bg-warn-50 text-warn-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  gold: 'bg-gold-50 text-gold-700',
};

const confirmVariant: Record<Tone, 'primary' | 'danger' | 'gold'> = {
  danger: 'danger',
  warn: 'primary',
  brand: 'primary',
  success: 'gold',
  gold: 'gold',
};

type ConfirmSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  loading?: boolean;
};

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  icon,
  tone = 'danger',
  loading,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      size="sm"
      onClose={loading ? () => undefined : onClose}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant[tone]}
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/* Stacked layout: the icon sits ABOVE the text instead of
          beside it, so the title and body get the full sheet width —
          a side icon narrowed the text column and made financially
          important copy cramped on phones (real-device report). */}
      <div className="pt-2 pb-1">
        {icon && (
          <span
            className={cn(
              'h-11 w-11 rounded-2xl grid place-items-center mb-3.5',
              toneClass[tone],
            )}
          >
            {icon}
          </span>
        )}
        <div className="text-[17px] font-bold text-ink-900 leading-snug tracking-tight">
          {title}
        </div>
        {description && (
          <p className="mt-2 text-[14px] text-ink-600 leading-[1.85]">
            {description}
          </p>
        )}
      </div>
    </Sheet>
  );
}
