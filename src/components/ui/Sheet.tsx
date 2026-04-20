import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
      <button
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/40 animate-fade-in"
      />
      <div
        className={cn(
          'relative w-full max-w-[440px] bg-white rounded-t-3xl shadow-float animate-slide-up',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className="pt-2 pb-1 flex justify-center">
          <span className="h-1.5 w-10 rounded-full bg-ink-200" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 text-[15px] font-semibold text-ink-900">{title}</div>
        )}
        <div className="px-5 pb-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-ink-100">{footer}</div>}
      </div>
    </div>
  );
}
