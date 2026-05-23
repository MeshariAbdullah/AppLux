// =====================================================================
// otp-verify — checks an OTP via Twilio Verify, and on success returns
// the matching renter's safe profile fields to the merchant.
// =====================================================================
// Auth: same as otp-send — merchant or admin only.
//
// Returns:
//   { verified: true, renter: { id, full_name, mobile, city, has_nafath } }
//   { verified: false }   (Twilio rejected the code)
//
// The renter is NEVER logged in on the merchant's device — this endpoint
// only confirms phone ownership for a session and returns the matched
// profile snapshot. The merchant's auth session is untouched.
//
// Required Edge Function secrets (same as otp-send):
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

async function checkViaTwilioVerify(
  e164: string,
  code: string,
): Promise<{ verified: boolean; reason?: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  if (!accountSid || !authToken || !serviceSid) {
    return { verified: false, reason: 'twilio_not_configured' };
  }

  const resp = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, Code: code }),
    },
  );

  if (!resp.ok) {
    console.error('[otp-verify] twilio responded', resp.status, await resp.text());
    return { verified: false, reason: 'twilio_check_failed' };
  }
  const data = (await resp.json()) as { status?: string };
  return { verified: data.status === 'approved' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 });

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { data: callerProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (
    !callerProfile ||
    (callerProfile.role !== 'merchant' && callerProfile.role !== 'admin')
  ) {
    return json({ error: 'Forbidden — merchants only' }, { status: 403 });
  }

  let body: { mobile?: unknown; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const normalized = typeof body.mobile === 'string' ? normalizeMobile(body.mobile) : null;
  if (!normalized) return json({ error: 'Invalid mobile' }, { status: 400 });
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  if (code.length < 4) return json({ error: 'Invalid code' }, { status: 400 });

  const check = await checkViaTwilioVerify(normalized.e164, code);
  if (!check.verified) {
    if (check.reason === 'twilio_not_configured') {
      return json({ error: 'twilio_not_configured' }, { status: 503 });
    }
    return json({ verified: false });
  }

  // Phone ownership confirmed. Now fetch the matched profile using the
  // service role — the merchant can't read other profiles via RLS, but
  // we already verified they own this OTP session.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: renter } = await admin
    .from('profiles')
    .select('id, full_name, mobile, city, nafath_verified_at')
    .eq('mobile', normalized.canonical)
    .eq('role', 'customer')
    .maybeSingle();

  return json({
    verified: true,
    renter: renter
      ? {
          id: renter.id,
          full_name: renter.full_name,
          mobile: renter.mobile,
          city: renter.city,
          has_nafath: !!renter.nafath_verified_at,
        }
      : null,
  });
});
