// =====================================================================
// otp-send — sends an OTP to a renter's mobile via Twilio Verify.
// =====================================================================
// Auth: caller must present a Supabase JWT and resolve to a profile with
// role = 'merchant' or 'admin'. No anonymous sends. No customer self-sends.
//
// Provider: Twilio Verify (REST). To swap providers later (e.g. Unifonic),
// replace `sendViaTwilioVerify` with a different implementation and keep
// the same request/response shape.
//
// Required Edge Function secrets:
//   - TWILIO_ACCOUNT_SID
//   - TWILIO_AUTH_TOKEN
//   - TWILIO_VERIFY_SERVICE_SID
// =====================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { normalizeMobile } from '../_shared/mobile.ts';

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

async function sendViaTwilioVerify(e164: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  if (!accountSid || !authToken || !serviceSid) {
    return { ok: false, reason: 'twilio_not_configured' };
  }

  const resp = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, Channel: 'sms' }),
    },
  );

  if (!resp.ok) {
    let detail: unknown = await resp.text();
    try { detail = JSON.parse(detail as string); } catch { /* keep as text */ }
    console.error('[otp-send] twilio responded', resp.status, detail);
    return { ok: false, reason: 'twilio_send_failed' };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 });

  // RLS-respecting caller identity.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || (profile.role !== 'merchant' && profile.role !== 'admin')) {
    return json({ error: 'Forbidden — merchants only' }, { status: 403 });
  }

  let body: { mobile?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const normalized = typeof body.mobile === 'string' ? normalizeMobile(body.mobile) : null;
  if (!normalized) return json({ error: 'Invalid mobile' }, { status: 400 });

  const result = await sendViaTwilioVerify(normalized.e164);
  if (!result.ok) {
    const status = result.reason === 'twilio_not_configured' ? 503 : 502;
    return json({ error: result.reason }, { status });
  }
  return json({ ok: true, sentTo: `+966${normalized.canonical.slice(0, 2)}•••${normalized.canonical.slice(-2)}` });
});
