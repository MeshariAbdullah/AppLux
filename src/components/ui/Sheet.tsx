import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

// Responsive dialog: bottom sheet on phones, centered dialog at md+
// (tablet/desktop) — a full-width bottom sheet on an iPad reads as a
// stretched phone control. One component, one API; the split is pure
// CSS so behavior/focus/escape handling is identical on every device.
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
    // Keyboard accessibility: move focus into the dialog so Escape,
    // Tab and screen readers land inside it, and hand it back to the
    // opener when the dialog closes.
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
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
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          // Phone: plush bottom sheet, full width up to the phone cap.
          // md+: centered dialog card with its own max width and full
          // rounding; enters with a fade+settle instead of the slide.
          'relative w-full max-w-[440px] bg-white rounded-t-[28px] shadow-plush outline-none',
          'pb-[env(safe-area-inset-bottom)] max-h-[88dvh] flex flex-col',
          'md:max-w-[560px] md:rounded-[28px] md:pb-0 md:max-h-[85dvh]',
          'transition-[transform,opacity] duration-260 ease-plush',
          visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-100 md:translate-y-2 md:opacity-0',
        )}
      >
        <div className="pt-3 pb-1 flex justify-center shrink-0 md:hidden">
          <span className="h-1.5 w-11 rounded-full bg-canvas-300" />
        </div>
        {title && (
          <div className="px-6 pt-3 pb-3 md:pt-6 text-[16px] font-semibold text-ink-900 shrink-0 tracking-tight">
            {title}
          </div>
        )}
        <div className={cn('px-6 pb-6 overflow-y-auto no-scrollbar', !title && 'md:pt-6')}>
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-canvas-200/80 bg-white/95 backdrop-blur shrink-0 md:rounded-b-[28px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
