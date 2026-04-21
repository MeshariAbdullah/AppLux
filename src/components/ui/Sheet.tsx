import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal
    >
      <button
        aria-label="close"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-ink-950/45 transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cn(
          'relative w-full max-w-[440px] bg-white rounded-t-3xl shadow-float ring-1 ring-ink-100',
          'pb-[env(safe-area-inset-bottom)] max-h-[88dvh] flex flex-col',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="h-1.5 w-10 rounded-full bg-ink-200/80" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 text-[15.5px] font-semibold text-ink-900 shrink-0">
            {title}
          </div>
        )}
        <div className="px-5 pb-5 overflow-y-auto no-scrollbar">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-ink-100 bg-white/95 backdrop-blur shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
