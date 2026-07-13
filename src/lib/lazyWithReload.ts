import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// =====================================================================
// lazyWithReload — Phase 5B. React.lazy with the standard SPA
// stale-deploy guard: after a redeploy, a session that started on the
// previous build may request a chunk hash that no longer exists. On
// the FIRST chunk-load failure we force one full reload (fresh
// index.html → fresh chunk manifest), gated by a sessionStorage flag
// so a genuinely broken deploy can't reload-loop; a second failure
// falls through to React and renders the Phase 2 AppErrorBoundary
// crash screen with a support code.
//
// The flag is transient/non-sensitive and clears on any successful
// lazy load, so a LATER deploy gets its own one-shot retry.
// Capacitor builds serve chunks from disk — this path can't trigger
// there.
// =====================================================================

const RELOAD_FLAG = 'lend.chunkReloadedOnce';

function readFlag(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return true; // storage unavailable → never auto-reload
  }
}

function writeFlag(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(RELOAD_FLAG, '1');
    else window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await importFn();
      writeFlag(false);
      return mod;
    } catch (err) {
      if (!readFlag()) {
        writeFlag(true);
        window.location.reload();
        // Reload takes over — suspend forever so nothing flashes.
        return new Promise<never>(() => {});
      }
      throw err;
    }
  });
}
