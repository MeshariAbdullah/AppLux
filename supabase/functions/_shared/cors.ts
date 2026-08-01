// =====================================================================
// Shared CORS for browser-invoked Edge Functions.
//
// supabase-js `functions.invoke` ALWAYS sends `authorization` (the anon
// key as Bearer) and `x-client-info` on the request — and the browser
// sends an OPTIONS preflight first. If those header names are not echoed
// in Access-Control-Allow-Headers, the preflight fails with
// "Request header field authorization is not allowed by
// Access-Control-Allow-Headers" and the real POST never runs.
//
// Only functions that are called from the browser need this. Internal /
// scheduled functions (no browser origin) do not.
// =====================================================================

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Answer the CORS preflight immediately — BEFORE any parsing, auth,
 *  database, or upload logic. Returns null for non-OPTIONS requests. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  return null;
}

/** JSON response with CORS headers on EVERY reply (success + errors). */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
