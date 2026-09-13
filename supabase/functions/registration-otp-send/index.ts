// =====================================================================
// registration-otp-send — texts a signup mobile-verification code via
// MSEGAT (send-only). SEPARATE from the renter-session otp-send so the
// two OTP features toggle independently; the MSEGAT SECRETS ARE THE
// SAME (MSEGAT_USERNAME / MSEGAT_API_KEY / MSEGAT_SENDER_NAME,
// optional MSEGAT_BASE_URL) — one credential set for both flows.
//
// Caller: the ANONYMOUS signup form (platform JWT check passes via the
// anon key; there is no user session yet). Abuse control lives in the
// registration_otp_start RPC: 60s resend cooldown (P0192) and 5 sends
// per mobile per hour (P0196). The code is DB-generated, hash-only
// stored, returned exclusively to this service-role call and handed
// straight to MSEGAT — never to the browser, never to logs.
//
// PREFLIGHT (real-testing fix): before creating a challenge or calling
// MSEGAT, registration_otp_precheck (service-role RPC,
// 20260502130300) verifies the email/mobile can actually register —
// a duplicate gets a clear error and costs NO SMS and NO challenge
// row. The RPC answers only whether registration can proceed (own
// per-mobile probe throttle server-side); the DB unique constraints
// and GoTrue stay the final authority at the actual signup. On a
// project that has not applied 20260502130300 yet (RPC missing) the
// send proceeds exactly as before.
// =====================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { normalizeMobile } from '../_shared/mobile.ts';
import {
  buildMsegatSendRequest,
  buildOtpSmsMessage,
  maskMsegatNumber,
  parseMsegatResponse,
  toMsegatNumber,
  type MsegatConfig,
} from '../_shared/msegat.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** The ONLY place credentials are read — via Deno.env exclusively. */
function readMsegatConfig(): MsegatConfig | null {
  const userName = Deno.env.get('MSEGAT_USERNAME');
  const apiKey = Deno.env.get('MSEGAT_API_KEY');
  const userSender = Deno.env.get('MSEGAT_SENDER_NAME');
  if (!userName || !apiKey || !userSender) return null;
  return {
    userName,
    apiKey,
    userSender,
    baseUrl: Deno.env.get('MSEGAT_BASE_URL') || undefined,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405 });

  let body: { mobile?: unknown; role?: unknown; email?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const normalized = typeof body.mobile === 'string' ? normalizeMobile(body.mobile) : null;
  if (!normalized) return json({ error: 'invalid_mobile' }, { status: 400 });
  // Which signup flow is verifying (customer registration is the
  // default; merchant registration passes 'merchant'). Same secrets,
  // same delivery — the role only scopes the server-side stamp.
  const role = body.role === 'merchant' ? 'merchant' : 'customer';
  // The signup email, for the duplicate preflight. Optional: an older
  // client that omits it still gets the mobile check.
  const email = typeof body.email === 'string' && body.email.trim() !== ''
    ? body.email.trim()
    : null;

  // Fail BEFORE creating a challenge when SMS delivery cannot happen.
  const cfg = readMsegatConfig();
  if (!cfg) return json({ error: 'otp_not_configured' }, { status: 503 });

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // PREFLIGHT — duplicate email/mobile blocks HERE: no challenge row,
  // no MSEGAT call, no SMS cost. Outcome codes only in logs (never the
  // email or full mobile).
  const { data: precheck, error: preErr } = await service.rpc('registration_otp_precheck', {
    p_mobile: normalized.canonical,
    p_account_role: role,
    p_email: email,
  });
  if (preErr) {
    const preCode = (preErr as { code?: string }).code ?? '';
    if (preCode === 'PGRST202') {
      // 20260502130300 not applied yet — behave exactly as before the
      // preflight existed rather than blocking signups.
      console.warn('[registration-otp-send] precheck RPC missing; proceeding without preflight');
    } else {
      console.error('[registration-otp-send] precheck failed', preCode || 'unknown');
      return json({ error: 'preflight_failed' }, { status: 500 });
    }
  } else if (precheck !== 'ok') {
    switch (precheck) {
      case 'email_taken':
        return json({ error: 'email_taken' }, { status: 409 });
      case 'mobile_taken':
        return json({ error: 'mobile_taken' }, { status: 409 });
      case 'invalid_email':
        return json({ error: 'invalid_email' }, { status: 400 });
      case 'invalid_mobile':
      case 'invalid_input':
        return json({ error: 'invalid_mobile' }, { status: 400 });
      case 'rate_limited':
        return json({ error: 'send_limit' }, { status: 429 });
      default:
        console.error('[registration-otp-send] precheck unexpected status');
        return json({ error: 'preflight_failed' }, { status: 500 });
    }
  }

  // Generate the challenge (service role; cooldown + hourly cap are
  // enforced inside the RPC). The plaintext code exists only in this
  // call's result and the MSEGAT request below.
  const { data: rows, error: startErr } = await service.rpc('registration_otp_start', {
    p_mobile: normalized.canonical,
    p_account_role: role,
  });
  if (startErr) {
    const code = (startErr as { code?: string }).code ?? '';
    if (code === 'P0192') return json({ error: 'cooldown' }, { status: 429 });
    if (code === 'P0196') return json({ error: 'send_limit' }, { status: 429 });
    if (code === 'P0190') return json({ error: 'invalid_mobile' }, { status: 400 });
    console.error('[registration-otp-send] start refused', code || 'unknown');
    return json({ error: 'send_failed' }, { status: 500 });
  }
  const challenge = Array.isArray(rows) ? rows[0] : null;
  if (!challenge) {
    console.error('[registration-otp-send] start returned no row');
    return json({ error: 'send_failed' }, { status: 500 });
  }

  const msegatNumber = toMsegatNumber(normalized.canonical);
  if (!msegatNumber) return json({ error: 'invalid_mobile' }, { status: 400 });

  const request = buildMsegatSendRequest(cfg, msegatNumber, buildOtpSmsMessage(challenge.code));
  let outcome;
  try {
    const resp = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    });
    let payload: unknown = await resp.text();
    try { payload = JSON.parse(payload as string); } catch { /* keep as text */ }
    outcome = resp.ok ? parseMsegatResponse(payload) : { ok: false as const, providerCode: `http_${resp.status}` };
  } catch {
    outcome = { ok: false as const, providerCode: 'network_error' };
  }

  if (!outcome.ok) {
    // providerCode is MSEGAT's numeric status — safe; no key, no code,
    // no message body, masked recipient only.
    console.error(
      '[registration-otp-send] msegat send failed',
      outcome.providerCode,
      'challenge', challenge.challenge_id,
      'to', maskMsegatNumber(msegatNumber),
    );
    return json({ error: 'sms_send_failed' }, { status: 502 });
  }

  console.log(
    '[registration-otp-send] sms dispatched',
    'challenge', challenge.challenge_id,
    'to', maskMsegatNumber(msegatNumber),
  );
  return json({ ok: true });
});
