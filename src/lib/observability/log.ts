import { releaseInfo } from '@/lib/releaseInfo';
import {
  sanitizeContext,
  sanitizeError,
  sanitizeRoute,
  type SanitizedError,
} from './sanitize';

// =====================================================================
// Structured logger — Phase 6A (internal, no vendor). One narrow API:
//
//   const id = logEvent(name, severity, context?, error?, presetId?)
//
// * Everything is sanitized BEFORE console output, ring-buffer
//   insertion, and any future 6B transport — tokens, PII, UUIDs, and
//   raw Postgres objects cannot pass through.
// * Returns a stable `LND-XXXXXXXX` event id. Call sites that surface
//   a technical failure to the user show the SAME id in the banner
//   (see withSupportId in lib/errors.ts) — generate once per failure,
//   never per render.
// * Dedupe: after 3 identical (name+code+message) events in a session,
//   further repeats are counted silently instead of flooding.
// * Recursion guard: a failure inside the logger can never re-enter it.
// * Output: single sanitized JSON line (prod) / prefixed readable line
//   (dev) — both from the SAME sanitized record.
// =====================================================================

export type EventSeverity = 'fatal' | 'error' | 'warn' | 'info';

export type LoggedEvent = {
  id: string;
  name: string;
  severity: EventSeverity;
  at: string;
  release: string;
  route: string;
  online: boolean;
  context: Record<string, string | number | boolean>;
  error?: SanitizedError;
};

export function newEventId(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `LND-${stamp}${rand}`;
}

// ---- ring buffer (memory-only; cleared on refresh/sign-out) ----
const MAX_EVENTS = 50;
const buffer: LoggedEvent[] = [];

export function getEventBuffer(): readonly LoggedEvent[] {
  return buffer;
}

/** Wired into the sign-out path beside cacheClearAll(). */
export function clearEventBuffer(): void {
  buffer.length = 0;
  dedupeCounts.clear();
}

// ---- dedupe ----
const DEDUPE_LIMIT = 3;
const dedupeCounts = new Map<string, number>();

let inLogger = false;

export function logEvent(
  name: string,
  severity: EventSeverity,
  context?: Record<string, unknown>,
  error?: unknown,
  presetId?: string,
): string {
  const id = presetId ?? newEventId();
  if (inLogger) return id;
  inLogger = true;
  try {
    const sanitizedError = error !== undefined ? sanitizeError(error) : undefined;

    const dedupeKey = `${name}:${sanitizedError?.code ?? ''}:${(sanitizedError?.message ?? '').slice(0, 60)}`;
    const seen = (dedupeCounts.get(dedupeKey) ?? 0) + 1;
    dedupeCounts.set(dedupeKey, seen);
    if (seen > DEDUPE_LIMIT) return id; // counted, not flooded

    const record: LoggedEvent = {
      id,
      name,
      severity,
      at: new Date().toISOString(),
      release: `${releaseInfo.version}@${releaseInfo.commit} ${releaseInfo.env}`,
      route:
        typeof window !== 'undefined'
          ? sanitizeRoute(window.location?.pathname ?? '/')
          : '/',
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      context: sanitizeContext(context),
      ...(sanitizedError ? { error: sanitizedError } : {}),
    };

    buffer.push(record);
    if (buffer.length > MAX_EVENTS) buffer.shift();

    const line = JSON.stringify(record);
    const emit =
      severity === 'info'
        ? // eslint-disable-next-line no-console
          console.info
        : severity === 'warn'
          ? // eslint-disable-next-line no-console
            console.warn
          : // eslint-disable-next-line no-console
            console.error;
    if (import.meta.env.DEV) {
      emit(`[lend:${name}] ${line}`);
    } else {
      emit(line);
    }
  } catch {
    // Never let observability break the app.
  } finally {
    inLogger = false;
  }
  return id;
}
