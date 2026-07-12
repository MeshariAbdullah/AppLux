import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { AlertIcon } from '@/components/icons';

// =====================================================================
// OfflineBanner — Phase 1 network awareness. A slim, NON-BLOCKING strip
// pinned above the app while `navigator.onLine` is false; disappears
// as soon as connectivity returns. Purely informational: it does not
// retry anything and never intercepts requests.
//
// z-[65] sits above sheets (z-50) and the lightbox (z-[60]) — an
// offline warning is relevant in all of them — but below the session
// dialogs (z-[70]).
// =====================================================================

export function OfflineBanner() {
  const t = useT();
  const [online, setOnline] = useState<boolean>(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[65] pt-[env(safe-area-inset-top)] bg-ink-900/95 text-white"
    >
      <div className="mx-auto max-w-md px-4 py-1.5 flex items-center justify-center gap-2 text-[12px] leading-snug">
        <AlertIcon size={13} className="shrink-0 text-warn-500" />
        <span className="truncate">{t('session.offline.banner')}</span>
      </div>
    </div>
  );
}
