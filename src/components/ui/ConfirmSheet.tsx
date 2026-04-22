import type { ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { cn } from '@/lib/cn';

type Tone = 'danger' | 'warn' | 'brand' | 'success';

const toneClass: Record<Tone, string> = {
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  warn: 'bg-warn-50 text-warn-600 ring-warn-500/20',
  brand: 'bg-brand-50 text-brand-600 ring-brand-500/15',
  success: 'bg-success-50 text-success-600 ring-success-500/20',
};

const confirmVariant: Record<Tone, 'primary' | 'danger'> = {
  danger: 'danger',
  warn: 'primary',
  brand: 'primary',
  success: 'primary',
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
        <div className="flex items-center gap-2.5">
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
      <div className="flex items-start gap-3 pt-1">
        {icon && (
          <span
            className={cn(
              'h-11 w-11 shrink-0 rounded-2xl grid place-items-center ring-1 ring-inset',
              toneClass[tone],
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink-900 leading-snug">
            {title}
          </div>
          {description && (
            <p className="mt-1 text-[13px] text-ink-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
