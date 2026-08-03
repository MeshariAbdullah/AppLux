// =====================================================================
// merchant-doc-upload — controlled, anonymous-safe quarantine upload for
// the merchant onboarding Commercial Registration copy (Step 5).
//
// The onboarding wizard has no session, so this function is the ONLY way
// a file reaches the private `merchant-documents` bucket. It runs with
// the SERVICE ROLE (never exposed to the browser) and is the reason the
// bucket needs no anonymous Storage policy at all.
//
// Flow:
//   POST multipart/form-data:
//     file            (required)  the CR copy — PDF/JPG/PNG, ≤5MB
//     replaceReceipt  (optional)  a prior receipt to invalidate+delete
//     captchaToken    (optional)  verified when TURNSTILE_SECRET is set
//   → 200 { receipt, fileName, size }   receipt = opaque single-use token
//
// Security:
//   * magic-byte sniff (not just declared MIME); executables rejected
//   * generated storage path quarantine/<ticketId>/cr.<ext>; the client
//     filename never touches the path
//   * only the SHA-256 hash of the receipt is persisted; the raw token
//     carries no merchant/user/application/db id
//   * per-IP hourly rate limit
//
// Deploy (manual): supabase functions deploy merchant-doc-upload --no-verify-jwt
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: TURNSTILE_SECRET, DOC_UPLOAD_IP_SALT, DOC_UPLOAD_MAX_PER_HOUR.
// =====================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// === CORS (inlined so this file is a self-contained Dashboard paste) ===
// supabase-js functions.invoke always sends `authorization` (anon key as
// Bearer) and `x-client-info`; the browser preflights with OPTIONS. Those
// header names MUST be echoed here or the preflight is rejected and the
// POST never runs. Keep in sync with any other browser-invoked function.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Answer the CORS preflight immediately — BEFORE any parsing, auth,
 *  database, or upload logic. Returns null for non-OPTIONS requests. */
function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  return null;
}

/** JSON response with CORS headers on EVERY reply (success + errors). */
function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
// === end CORS ===

const BUCKET = 'merchant-documents';
const MAX_BYTES = 5 * 1024 * 1024;
const TICKET_TTL_MS = 30 * 60 * 1000; // 30 minutes — mirror the DB default

async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Magic-byte sniff → canonical MIME + extension, or null if unsupported.
function sniff(bytes: Uint8Array): { mime: string; ext: string } | null {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return { mime: 'application/pdf', ext: 'pdf' }; // %PDF
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  return null; // anything else (incl. MZ/ELF executables, SVG, zip) rejected
}

function sanitizeName(raw: string, ext: string): string {
  const base = (raw || 'commercial-registration')
    .replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'commercial-registration';
  return `${base}.${ext}`;
}

async function verifyCaptcha(token: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!secret) return true; // not configured → do not hard-block (dev)
  if (!token) return false;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await resp.json();
    return Boolean(data.success);
  } catch (err) {
    console.error('[merchant-doc-upload] captcha verify failed', err);
    return false;
  }
}

serve(async (req) => {
  // Answer the CORS preflight before ANY other logic.
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405 });

  try {
    return await handleUpload(req);
  } catch (err) {
    // Unexpected exception — still reply WITH CORS + a sanitized error.
    console.error('[merchant-doc-upload] unhandled', err);
    return json({ error: 'unknown' }, { status: 500 });
  }
});

async function handleUpload(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not_configured' }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  const captchaOk = await verifyCaptcha(
    typeof form.get('captchaToken') === 'string' ? (form.get('captchaToken') as string) : null,
  );
  if (!captchaOk) return json({ error: 'captcha_failed' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'file_required' }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: 'file_too_large' }, { status: 413 });

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return json({ error: 'unsupported_type' }, { status: 415 });

  // Per-IP hourly rate limit (IP hashed with a salt; never stored raw).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipHash = await sha256Hex(`${Deno.env.get('DOC_UPLOAD_IP_SALT') ?? 'lend'}:${ip}`);
  const maxPerHour = Number(Deno.env.get('DOC_UPLOAD_MAX_PER_HOUR') ?? '10');
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('merchant_upload_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((count ?? 0) >= maxPerHour) return json({ error: 'rate_limited' }, { status: 429 });

  // Replacement: invalidate + delete the previously quarantined file.
  const replaceReceipt = form.get('replaceReceipt');
  if (typeof replaceReceipt === 'string' && replaceReceipt.length > 0) {
    const oldHash = await sha256Hex(replaceReceipt);
    const { data: old } = await admin
      .from('merchant_upload_tickets')
      .select('id, storage_path, status')
      .eq('token_hash', oldHash)
      .maybeSingle();
    if (old && old.status === 'uploaded') {
      if (old.storage_path) await admin.storage.from(BUCKET).remove([old.storage_path]);
      await admin
        .from('merchant_upload_tickets')
        .update({ status: 'deleted', storage_path: null })
        .eq('id', old.id);
    }
  }

  const ticketId = crypto.randomUUID();
  const rawToken = randomToken();
  const tokenHash = await sha256Hex(rawToken);
  const storagePath = `quarantine/${ticketId}/cr.${kind.ext}`;

  const up = await admin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: kind.mime,
    upsert: false,
  });
  if (up.error) {
    console.error('[merchant-doc-upload] storage upload failed', up.error);
    return json({ error: 'upload_failed' }, { status: 502 });
  }

  const ins = await admin.from('merchant_upload_tickets').insert({
    id: ticketId,
    token_hash: tokenHash,
    doc_type: 'commercial_registration',
    status: 'uploaded',
    storage_path: storagePath,
    original_name: sanitizeName(file.name, kind.ext),
    mime_type: kind.mime,
    file_size: file.size,
    ip_hash: ipHash,
    uploaded_at: new Date().toISOString(),
    // Belt-and-suspenders: set expires_at explicitly so a ticket is never
    // created with a NULL expiry even if a deployed table is missing the
    // column default. The DB also enforces NOT NULL + a 30-min default.
    expires_at: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
  });
  if (ins.error) {
    await admin.storage.from(BUCKET).remove([storagePath]); // no orphan
    console.error('[merchant-doc-upload] ticket insert failed', ins.error);
    return json({ error: 'upload_failed' }, { status: 500 });
  }

  return json({ receipt: rawToken, fileName: sanitizeName(file.name, kind.ext), size: file.size });
}
