// =====================================================================
// otp-send — delivers the renter-OTP code by SMS via MSEGAT
// (send-only; repurposed from the earlier Twilio Verify stub).
// =====================================================================
// The DATABASE remains the single OTP authority: this function first
// calls merchant_start_renter_otp WITH THE CALLER'S JWT (so the role
// check, customer lookup, throttle, supersession, and code generation
// all stay server-enforced exactly as in the in-app mode), then — with
// the service-role key — performs the ONE-TIME fetch of the plaintext
// code (get_renter_otp_for_dispatch, 20260502125500) and hands it to
// MSEGAT as a plain SMS. Verification NEVER touches MSEGAT: the
// merchant still confirms the code through merchant_verify_renter_otp,
// which is what the P0195 offer-issuance gate consumes.
//
// Auth: caller must present a Supabase JWT resolving to a profile with
// role = 'merchant' or 'admin'. No anonymous sends, no customer
// self-sends.
//
// Required Edge Function secrets (Supabase → Edge Functions → Secrets;
// never VITE_*, never in the repo):
//   - MSEGAT_USERNAME
//   - MSEGAT_API_KEY
//   - MSEGAT_SENDER_NAME
//   - MSEGAT_BASE_URL   (optional; default https://www.msegat.com)
//
// Logging rules (enforced below): never the API key, never the OTP
// code, never the SMS body, never the full recipient number — only
// challenge ids, masked numbers, and MSEGAT's numeric status code.
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

/** Reads the MSEGAT secrets; null when the provider is not configured.
 *  This is the ONLY place credentials are read, and only via Deno.env. */
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, { status: 401 });

  // Caller-scoped client: RPCs below run under the merchant's own JWT.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || (profile.role !== 'merchant' && profile.role !== 'admin')) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { mobile?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const normalized = typeof body.mobile === 'string' ? normalizeMobile(body.mobile) : null;
  if (!normalized) return json({ error: 'invalid_mobile' }, { status: 400 });

  // Fail BEFORE creating a challenge when SMS delivery cannot happen —
  // otherwise the customer would be left with a code nobody delivers.
  const cfg = readMsegatConfig();
  if (!cfg) return json({ error: 'otp_not_configured' }, { status: 503 });

  // 1) Start the challenge under the caller's JWT — identical rules to
  //    the in-app mode (P0030 role, P0190 mobile, P0191 no customer,
  //    P0192 throttle). Error codes pass through for client mapping.
  const { error: startErr } = await supabase.rpc('merchant_start_renter_otp', {
    p_mobile: normalized.canonical,
    // SMS delivery: the code arrives by text — suppress the in-app
    // "code is waiting in the app" push nudge (20260502125700).
    p_delivery: 'sms',
  });
  if (startErr) {
    const code = (startErr as { code?: string }).code ?? 'start_failed';
    console.error('[otp-send] challenge start refused', code);
    return json({ error: 'otp_start_failed', code }, { status: 409 });
  }

  // 2) One-time plaintext fetch — service role only, never the caller.
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: dispatchRows, error: dispatchErr } = await service.rpc(
    'get_renter_otp_for_dispatch',
    { p_mobile: normalized.canonical, p_created_by: user.id },
  );
  const dispatch = Array.isArray(dispatchRows) ? dispatchRows[0] : null;
  if (dispatchErr || !dispatch) {
    console.error('[otp-send] dispatch fetch failed', dispatchErr?.code ?? 'no_row');
    return json({ error: 'send_failed' }, { status: 500 });
  }

  const msegatNumber = toMsegatNumber(dispatch.mobile);
  if (!msegatNumber) {
    console.error('[otp-send] unexpected non-canonical mobile on challenge', dispatch.challenge_id);
    return json({ error: 'send_failed' }, { status: 500 });
  }

  // 3) Hand the code to MSEGAT. The code exists only inside `request`
  //    from here on — it is never logged and never returned.
  const request = buildMsegatSendRequest(cfg, msegatNumber, buildOtpSmsMessage(dispatch.code));
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
      '[otp-send] msegat send failed',
      outcome.providerCode,
      'challenge', dispatch.challenge_id,
      'to', maskMsegatNumber(msegatNumber),
    );
    return json({ error: 'sms_send_failed' }, { status: 502 });
  }

  console.log(
    '[otp-send] sms dispatched',
    'challenge', dispatch.challenge_id,
    'to', maskMsegatNumber(msegatNumber),
  );
  return json({ ok: true, sentTo: `+${maskMsegatNumber(msegatNumber)}` });
});
