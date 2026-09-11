// =====================================================================
// registration-otp-verify — checks the signup mobile-verification code
// against OUR database (registration_otp_check RPC). MSEGAT is never
// involved in verification; it only delivered the SMS. On success the
// challenge is marked verified server-side, and the profiles BEFORE
// INSERT trigger (20260502125600) later consumes it to stamp
// profiles.mobile_verified_at at account creation.
//
// Caller: the anonymous signup form (anon key passes the platform JWT
// check). Attempt cap (5) and 5-minute expiry are enforced in the RPC.
// Never logs codes or full numbers.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405 });

  let body: { mobile?: unknown; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const normalized = typeof body.mobile === 'string' ? normalizeMobile(body.mobile) : null;
  if (!normalized) return json({ error: 'invalid_mobile' }, { status: 400 });
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  if (code.length !== 6) return json({ verified: false });

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await service.rpc('registration_otp_check', {
    p_mobile: normalized.canonical,
    p_code: code,
  });
  if (error) {
    const errCode = (error as { code?: string }).code ?? '';
    if (errCode === 'P0193') return json({ error: 'no_active_challenge' }, { status: 410 });
    if (errCode === 'P0194') return json({ error: 'too_many_attempts' }, { status: 429 });
    if (errCode === 'P0190') return json({ error: 'invalid_mobile' }, { status: 400 });
    console.error('[registration-otp-verify] check failed', errCode || 'unknown');
    return json({ error: 'verify_failed' }, { status: 500 });
  }
  return json({ verified: data === true });
});
