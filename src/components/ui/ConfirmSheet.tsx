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
      <div className="flex items-start gap-4 pt-2">
        {icon && (
          <span
            className={cn(
              'h-12 w-12 shrink-0 rounded-2xl grid place-items-center',
              toneClass[tone],
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-ink-900 leading-snug tracking-tight">
            {title}
          </div>
          {description && (
            <p className="mt-1.5 text-[13.5px] text-ink-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
