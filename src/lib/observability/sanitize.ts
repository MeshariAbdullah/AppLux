// =====================================================================
// Sanitizers — Phase 6A. EVERYTHING that leaves the app's runtime
// state for a log line, the ring buffer, the crash screen, or (later,
// 6B) an external transport passes through here first.
//
// Dependency-free by design so it can be bundled standalone for the
// Node scrub tests and imported anywhere without cycles.
//
// Forbidden (approved privacy decision): national ID, mobile, email,
// names, ANY entity UUID (user/customer/merchant/contract/invoice),
// invoice scan tokens, review/approval/tracking tokens, JWTs,
// access/refresh tokens, authorization headers, full tokenized URLs,
// free-text contract/damage content, raw Supabase/Postgres error
// objects, and storage contents.
// =====================================================================

const REDACTED = '[redacted]';

/** Ordered redaction rules — most specific first. */
const TEXT_RULES: Array<[RegExp, string]> = [
  // JWTs (three base64url segments starting with eyJ).
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  // Explicit token-ish query params / fields.
  [/((?:scan_token|access_token|refresh_token|apikey|api_key|token)["']?\s*[=:]\s*["']?)[\w.-]+/gi, `$1${REDACTED}`],
  [/(authorization["']?\s*[=:]\s*["']?)(bearer\s+)?[\w.-]+/gi, `$1${REDACTED}`],
  // UUIDs (entity identifiers — excluded from observability entirely).
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, REDACTED],
  // Emails.
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED],
  // Saudi national ID: 10 digits starting 1 or 2.
  [/\b[12]\d{9}\b/g, REDACTED],
  // Saudi mobiles: +9665XXXXXXXX / 9665XXXXXXXX / 05XXXXXXXX / 5XXXXXXXX.
  [/\+?966\s?5\d{8}\b/g, REDACTED],
  [/\b0?5\d{8}\b/g, REDACTED],
];

/** Scrub a free-text string. Never throws; non-strings pass through
 *  String() first. Output capped at 300 chars. */
export function scrubText(input: unknown): string {
  let text: string;
  try {
    text = typeof input === 'string' ? input : String(input ?? '');
  } catch {
    return '';
  }
  for (const [pattern, replacement] of TEXT_RULES) {
    text = text.replace(pattern, replacement);
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

// ---------------------------------------------------------------------
// Route sanitization — the logger NEVER stores a real URL. Known app
// routes map to their pattern; unknown paths get token-ish segments
// replaced. Query string and hash are always dropped entirely.
// ---------------------------------------------------------------------

const ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/review\/[^/]+$/, '/review/:token'],
  [/^\/approval\/[^/]+$/, '/approval/:token'],
  [/^\/tracking\/[^/]+$/, '/tracking/:token'],
  [/^\/track\/invoice\/[^/]+$/, '/track/invoice/:id'],
  [/^\/track\/contract\/[^/]+$/, '/track/contract/:id'],
  [/^\/track\/note\/[^/]+$/, '/track/note/:id'],
  [/^\/stores\/[^/]+$/, '/stores/:id'],
  [/^\/merchant\/rentals\/[^/]+$/, '/merchant/rentals/:id'],
  [/^\/merchant\/rentals\/[^/]+\/close$/, '/merchant/rentals/:id/close'],
  [/^\/merchant\/rentals\/[^/]+\/contract$/, '/merchant/rentals/:id/contract'],
  [/^\/merchant\/rentals\/[^/]+\/note$/, '/merchant/rentals/:id/note'],
  [/^\/merchant\/rentals\/[^/]+\/damage\/new$/, '/merchant/rentals/:id/damage/new'],
  [/^\/merchant\/approvals\/[^/]+$/, '/merchant/approvals/:id'],
  [/^\/merchant\/damages\/[^/]+$/, '/merchant/damages/:id'],
  [/^\/admin\/merchants\/[^/]+$/, '/admin/merchants/:id'],
  [/^\/admin\/users\/[^/]+$/, '/admin/users/:id'],
  [/^\/admin\/cases\/[^/]+$/, '/admin/cases/:id'],
];

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKENISH_SEGMENT = /^(?=.*\d)[\w-]{10,}$/; // long, contains a digit

/** Reduce a pathname to a route PATTERN. Never returns query/hash. */
export function sanitizeRoute(pathname: string): string {
  let path: string;
  try {
    path = pathname.split('?')[0].split('#')[0];
  } catch {
    return '/';
  }
  for (const [pattern, replacement] of ROUTE_PATTERNS) {
    if (pattern.test(path)) return replacement;
  }
  // Fallback: pattern-ize identifier-looking segments.
  const parts = path.split('/').map((seg) =>
    UUID_SEGMENT.test(seg) ? ':id' : TOKENISH_SEGMENT.test(seg) ? ':param' : seg,
  );
  return parts.join('/') || '/';
}

// ---------------------------------------------------------------------
// Error sanitization — a raw Supabase/Postgres error never leaves this
// function. `details` and `hint` are DROPPED deliberately: Postgres
// echoes row values there (e.g. unique-violation keys).
// ---------------------------------------------------------------------

export type SanitizedError = {
  name?: string;
  code?: string;
  status?: number;
  message: string;
};

export function sanitizeError(err: unknown): SanitizedError {
  const e = (err && typeof err === 'object' ? err : {}) as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const out: SanitizedError = {
    message: scrubText(
      typeof e.message === 'string' ? e.message : err instanceof Error ? err.message : String(err ?? 'unknown'),
    ),
  };
  if (typeof e.name === 'string' && e.name !== 'Error') out.name = scrubText(e.name).slice(0, 60);
  if (typeof e.code === 'string' && /^[\w.-]{1,20}$/.test(e.code)) out.code = e.code;
  if (typeof e.status === 'number') out.status = e.status;
  return out;
}

// ---------------------------------------------------------------------
// Context sanitization — call sites pass small scalar contexts; this
// enforces it. Keys matching sensitive names are dropped outright,
// string values are scrubbed, non-scalars are rejected.
// ---------------------------------------------------------------------

const FORBIDDEN_KEYS =
  /token|jwt|secret|password|auth|mobile|phone|email|national|name$|_id$|^id$|uuid|storage/i;

export function sanitizeContext(
  ctx: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!ctx) return out;
  for (const [key, value] of Object.entries(ctx)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = scrubText(value).slice(0, 120);
    }
    // objects/arrays/functions dropped — contexts are scalars only.
  }
  return out;
}
