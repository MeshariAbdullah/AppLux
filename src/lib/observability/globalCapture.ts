import { logEvent } from './log';
import { scrubText } from './sanitize';

// =====================================================================
// Global error capture — Phase 6A. Catches what the AppErrorBoundary
// cannot: errors outside React's render/lifecycle (fire-and-forget
// async chains, event handlers, timers) and unhandled promise
// rejections.
//
// * Sanitized via logEvent like everything else.
// * Boundary dedupe: AppErrorBoundary notes the error it just handled;
//   if the same message reaches window.onerror within a short window
//   we skip the duplicate event.
// * An unhandled rejection is LOGGED but never replaces the UI — the
//   app keeps running unless React itself unmounted (boundary's job).
// =====================================================================

let installed = false;

// Messages the boundary reported very recently — skip the echo.
const recentBoundaryErrors = new Map<string, number>();
const BOUNDARY_ECHO_WINDOW_MS = 2_000;

/** Called by AppErrorBoundary right after it logs app_crash. */
export function noteBoundaryError(message: unknown): void {
  try {
    recentBoundaryErrors.set(scrubText(message).slice(0, 120), Date.now());
  } catch {
    /* never throw from observability */
  }
}

function isBoundaryEcho(message: string): boolean {
  const key = message.slice(0, 120);
  const at = recentBoundaryErrors.get(key);
  if (at === undefined) return false;
  if (Date.now() - at > BOUNDARY_ECHO_WINDOW_MS) {
    recentBoundaryErrors.delete(key);
    return false;
  }
  return true;
}

export function installGlobalErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    try {
      const message = scrubText(event.message ?? event.error?.message ?? 'unknown');
      if (isBoundaryEcho(message)) return;
      logEvent(
        'unhandled_error',
        'error',
        {
          // Source FILE name only — never the full asset URL (query
          // strings can carry sensitive parameters).
          source: scrubText((event.filename ?? '').split('/').pop() ?? ''),
          line: typeof event.lineno === 'number' ? event.lineno : 0,
        },
        event.error ?? event.message,
      );
    } catch {
      /* never throw from observability */
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      logEvent('unhandled_rejection', 'error', {}, event.reason);
    } catch {
      /* never throw from observability */
    }
  });
}
