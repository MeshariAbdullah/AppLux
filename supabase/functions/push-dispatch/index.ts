// push-dispatch — drains pending push_jobs and delivers them to APNs.
// Single-file, Supabase-Dashboard-compatible (no shared imports).
//
// Invoke on a schedule (Dashboard cron / pg_cron+pg_net) or manually.
// Auth: called service-to-service with the Supabase secret key in the
// `apikey` header (verify_jwt = false); the service-role key is used
// internally for DB access. Clients can never call it.
//
// Secrets (Edge Function secrets — NEVER in the client bundle):
//   APNS_TEAM_ID      — Apple Developer Team ID
//   APNS_KEY_ID       — APNs Auth Key ID (the .p8 key)
//   APNS_PRIVATE_KEY  — the .p8 file content (PEM, with BEGIN/END lines)
//   APNS_TOPIC        — bundle id, e.g. sa.lend.app
//   APNS_ENV          — "sandbox" | "production" (default sandbox)
// Built-ins already present: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const TOPIC = Deno.env.get("APNS_TOPIC") ?? "sa.lend.app";
const APNS_HOST =
  (Deno.env.get("APNS_ENV") ?? "sandbox") === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
const BATCH = 50;

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedJwt: { value: string; iat: number } | null = null;
async function apnsJwt(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedJwt && nowSec - cachedJwt.iat < 45 * 60) return cachedJwt.value;
  const pem = PRIVATE_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: TEAM_ID, iat: nowSec }));
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key,
    new TextEncoder().encode(`${header}.${claims}`),
  ));
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  cachedJwt = { value: jwt, iat: nowSec };
  return jwt;
}

Deno.serve(async (req) => {
  // Service-to-service auth (matches the deployed Dashboard version):
  // the Cron scheduler sends the Supabase secret key in the `apikey`
  // header; the function compares it against the platform-provided
  // SUPABASE_SECRET_KEYS. Requires verify_jwt = false for this
  // function. SUPABASE_SERVICE_ROLE_KEY remains the privileged DB
  // credential below.
  const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const EXPECTED_API_KEY = SECRET_KEYS["default"] ?? "";
  const apiKey = req.headers.get("apikey") ?? "";
  if (!EXPECTED_API_KEY || !apiKey || apiKey !== EXPECTED_API_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  if (!TEAM_ID || !KEY_ID || !PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "apns secrets not configured" }), { status: 500 });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: jobs, error } = await sb
    .from("push_jobs").select("*").eq("status", "pending")
    .order("created_at").limit(BATCH);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0, failed = 0, tokensRevoked = 0;
  for (const job of jobs ?? []) {
    const { data: tokens } = await sb
      .from("push_device_tokens").select("token")
      .eq("user_id", job.user_id).is("revoked_at", null);
    let delivered = false, lastError = "no active device tokens";
    for (const t of tokens ?? []) {
      try {
        const res = await fetch(`${APNS_HOST}/3/device/${t.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${await apnsJwt()}`,
            "apns-topic": TOPIC,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-collapse-id": job.notification_id,
          },
          body: JSON.stringify({
            // Privacy-conscious: generic title only + the deep link.
            aps: { alert: { title: job.title }, sound: "default", badge: 1 },
            route: job.route,
          }),
        });
        if (res.ok) { delivered = true; continue; }
        const body = await res.text();
        lastError = `${res.status} ${body}`.slice(0, 300);
        // Stale/invalid token → revoke so we stop retrying it.
        if (res.status === 410 || body.includes("BadDeviceToken") || body.includes("Unregistered")) {
          await sb.from("push_device_tokens")
            .update({ revoked_at: new Date().toISOString() })
            .eq("token", t.token);
          tokensRevoked++;
        }
      } catch (e) {
        lastError = String(e).slice(0, 300);
      }
    }
    await sb.from("push_jobs").update(
      delivered
        ? { status: "sent", sent_at: new Date().toISOString(), attempts: job.attempts + 1 }
        : job.attempts + 1 >= 5
          ? { status: "failed", attempts: job.attempts + 1, last_error: lastError }
          : { attempts: job.attempts + 1, last_error: lastError },
    ).eq("id", job.id);
    if (delivered) sent++; else failed++;
    // Diagnosable without secrets: no tokens, no keys, truncated reason.
    console.log(JSON.stringify({
      job: job.id,
      user: String(job.user_id).slice(0, 8),
      tokens: (tokens ?? []).length,
      outcome: delivered ? "sent" : (job.attempts + 1 >= 5 ? "failed" : "retry"),
      reason: delivered ? undefined : lastError.slice(0, 160),
    }));
  }
  return new Response(JSON.stringify({ processed: (jobs ?? []).length, sent, failed, tokensRevoked }), {
    headers: { "content-type": "application/json" },
  });
});
