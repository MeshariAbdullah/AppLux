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
    const t = window.setTimeout(() => setMounted(false), 260);
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
          'absolute inset-0 bg-ink-950/55 backdrop-blur-[2px] transition-opacity duration-260',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cn(
          // Warm, plush, generous top radius; deeper shadow.
          // Width tracks the MobileShell tablet strategy so sheets are
          // never narrower than the app column behind them.
          'relative w-full max-w-[440px] md:max-w-[600px] lg:max-w-[680px] bg-white rounded-t-[28px] shadow-plush',
          'pb-[env(safe-area-inset-bottom)] max-h-[88dvh] flex flex-col',
          'transition-transform duration-260 ease-plush',
          visible ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="pt-3 pb-1 flex justify-center shrink-0">
          <span className="h-1.5 w-11 rounded-full bg-canvas-300" />
        </div>
        {title && (
          <div className="px-6 pt-3 pb-3 text-[16px] font-semibold text-ink-900 shrink-0 tracking-tight">
            {title}
          </div>
        )}
        <div className="px-6 pb-6 overflow-y-auto no-scrollbar">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-canvas-200/80 bg-white/95 backdrop-blur shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
