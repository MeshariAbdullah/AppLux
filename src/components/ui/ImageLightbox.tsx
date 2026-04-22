import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type ImageLightboxProps = {
  open: boolean;
  images: string[];
  startIndex?: number;
  onClose: () => void;
  caption?: (index: number, total: number) => string;
};

export function ImageLightbox({
  open,
  images,
  startIndex = 0,
  onClose,
  caption,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight')
        setIndex((i) => (i + 1) % Math.max(images.length, 1));
      if (e.key === 'ArrowLeft')
        setIndex((i) => (i - 1 + images.length) % Math.max(images.length, 1));
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, images.length]);

  if (!open || images.length === 0) return null;
  const total = images.length;
  const current = images[index];

  const goPrev = () =>
    setIndex((i) => (i - 1 + total) % total);
  const goNext = () => setIndex((i) => (i + 1) % total);

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink-950/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal
    >
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 text-white">
        <span className="text-[12.5px] font-semibold num">
          {caption ? caption(index, total) : `${index + 1} / ${total}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="h-9 w-9 rounded-full bg-white/10 ring-1 ring-white/15 grid place-items-center text-[18px] leading-none hover:bg-white/15"
        >
          ×
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-4">
        <img
          src={current}
          alt=""
          className="max-h-full max-w-full object-contain rounded-xl shadow-float"
        />
        {total > 1 && (
          <>
            <NavButton side="start" onClick={goPrev} label="previous" />
            <NavButton side="end" onClick={goNext} label="next" />
          </>
        )}
      </div>

      {total > 1 && (
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 w-max">
            {images.map((src, i) => (
              <button
                key={`${i}-${src.length}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`thumbnail ${i + 1}`}
                className={cn(
                  'h-12 w-12 rounded-xl overflow-hidden ring-2 transition-all shrink-0',
                  i === index
                    ? 'ring-white scale-100'
                    : 'ring-white/10 opacity-70 hover:opacity-100',
                )}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({
  side,
  onClick,
  label,
}: {
  side: 'start' | 'end';
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 ring-1 ring-white/15 grid place-items-center text-white text-[18px] hover:bg-white/15',
        side === 'start' ? 'start-3' : 'end-3',
      )}
    >
      {side === 'start' ? '‹' : '›'}
    </button>
  );
}
