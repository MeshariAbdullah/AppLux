import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { openExternalUrl } from '@/lib/openExternal';
import { DocIcon } from '@/components/icons';

// =====================================================================
// DocumentPreview — reusable fullscreen viewer for privately stored
// attachments (merchant onboarding documents today; anything that can
// mint a short-lived signed URL tomorrow).
//
// Why this exists (root cause of the "عرض does nothing" bug): the old
// flow awaited the signed-URL mint and THEN called window.open — the
// await consumes the browser's transient user activation, so the popup
// is silently blocked (always on Safari / iOS WKWebView, often on
// Chrome). This component removes the popup from the primary path:
// the click opens THIS overlay, the URL is minted asynchronously into
// state, and the preview renders inline. The "open externally" button
// then calls window.open SYNCHRONOUSLY with the already-minted URL, so
// the user gesture survives.
//
// Rendering by type:
//   * image/*          → inline <img> (reliable everywhere)
//   * application/pdf  → inline <iframe> (native PDF rendering on
//                        desktop web; renders on iOS WebKit too) with
//                        the external-open fallback always visible
//   * anything else    → no inline attempt; external open only
//
// Security: the caller supplies `mint`, a function that produces a
// FRESH short-lived signed URL each time it is called (storage RLS
// stays authoritative — an unauthorized caller mints nothing). URLs
// live only in component state, are never persisted, and the raw
// storage path is never rendered. Expired URL? The refresh action
// re-mints; a failed mint (missing file / revoked access) shows a
// clean error with retry — never a blank screen.
// =====================================================================

export type DocumentPreviewTarget = {
  /** Human label for the header (doc-type label, localized). */
  title: string;
  /** Original uploaded file name (shown small; helps the reviewer). */
  fileName: string;
  /** MIME type from the document record; null → external open only. */
  mimeType: string | null;
};

export function DocumentPreview({
  open,
  target,
  mint,
  onClose,
}: {
  open: boolean;
  target: DocumentPreviewTarget | null;
  /** Mints a fresh short-lived signed URL. Called on open and on every
   *  refresh/retry. Resolving null = not available (missing file or
   *  not authorized). */
  mint: () => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  // Monotonic token so a stale mint can never clobber a newer one
  // (rapid retry taps, or open→close→open on another document).
  const mintSeq = useRef(0);
  // Latest callbacks behind stable refs: the effect below must run on
  // open/close ONLY — inline arrow props from the parent would
  // otherwise re-trigger it (and re-mint) on every parent render.
  const mintRef = useRef(mint);
  mintRef.current = mint;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const runMint = useCallback(() => {
    const seq = ++mintSeq.current;
    setState('loading');
    setUrl(null);
    mintRef
      .current()
      .then((signed) => {
        if (seq !== mintSeq.current) return;
        if (signed) {
          setUrl(signed);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (seq === mintSeq.current) setState('error');
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    runMint();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, runMint]);

  if (!open || !target) return null;

  const isImage = Boolean(target.mimeType?.startsWith('image/'));
  const isPdf = target.mimeType === 'application/pdf';

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink-950/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 text-white">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">
            {target.title}
          </span>
          <span className="block truncate text-[11px] text-white/60" dir="ltr">
            {target.fileName}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="h-9 w-9 shrink-0 rounded-full bg-white/10 ring-1 ring-white/15 grid place-items-center text-[18px] leading-none hover:bg-white/15"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 pb-3">
        {state === 'loading' && (
          <div className="text-[12.5px] text-white/70 animate-pulse">
            {t('docPreview.loading')}
          </div>
        )}

        {state === 'error' && (
          <div className="max-w-[300px] text-center space-y-3">
            <p className="text-[12.5px] text-white/80 leading-relaxed">
              {t('docPreview.error')}
            </p>
            <button
              type="button"
              onClick={runMint}
              className="inline-flex items-center justify-center h-10 px-5 rounded-xl2 bg-white/10 ring-1 ring-white/20 text-[12.5px] font-semibold text-white hover:bg-white/15"
            >
              {t('docPreview.retry')}
            </button>
          </div>
        )}

        {state === 'ready' && url && isImage && (
          <img
            src={url}
            alt={target.fileName}
            className="max-h-full max-w-full object-contain rounded-xl shadow-float bg-white"
          />
        )}

        {state === 'ready' && url && isPdf && (
          <iframe
            src={url}
            title={target.fileName}
            className="h-full w-full rounded-xl bg-white"
          />
        )}

        {state === 'ready' && url && !isImage && !isPdf && (
          <div className="max-w-[300px] text-center space-y-3">
            <span className="mx-auto h-12 w-12 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white/80">
              <DocIcon size={20} />
            </span>
            <p className="text-[12.5px] text-white/80 leading-relaxed">
              {t('docPreview.noInline')}
            </p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-1 flex items-center justify-center gap-2.5">
        <button
          type="button"
          // SYNCHRONOUS open of the already-minted URL — no await in the
          // gesture, so the browser never blocks it.
          onClick={() => openExternalUrl(url)}
          disabled={state !== 'ready' || !url}
          className="h-11 px-5 rounded-xl2 bg-white text-ink-900 text-[13px] font-bold disabled:opacity-40"
        >
          {t('docPreview.openExternal')}
        </button>
        <button
          type="button"
          onClick={runMint}
          className="h-11 px-5 rounded-xl2 bg-white/10 ring-1 ring-white/20 text-[13px] font-semibold text-white hover:bg-white/15"
        >
          {t('docPreview.refresh')}
        </button>
      </div>
    </div>
  );
}
