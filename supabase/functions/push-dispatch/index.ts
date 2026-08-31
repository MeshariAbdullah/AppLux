// push-dispatch — drains pending push_jobs and delivers them per
// device platform: APNs for iOS tokens, FCM HTTP v1 for Android tokens.
// Single-file, Supabase-Dashboard-compatible (no shared imports).
//
// Invoke on a schedule (Dashboard cron / pg_cron+pg_net) or manually.
// Auth: called service-to-service with the Supabase secret key in the
// `apikey` header (verify_jwt = false); the service-role key is used
// internally for DB access. Clients can never call it.
//
// Secrets (Edge Function secrets — NEVER in the client bundle / git):
//   APNS_TEAM_ID         — Apple Developer Team ID
//   APNS_KEY_ID          — APNs Auth Key ID (the .p8 key)
//   APNS_PRIVATE_KEY     — the .p8 file content (PEM, with BEGIN/END lines)
//   APNS_TOPIC           — bundle id, e.g. sa.lend.app
//   APNS_ENV             — "sandbox" | "production" (default sandbox)
//   FCM_SERVICE_ACCOUNT  — Firebase service-account JSON (the full file
//                          content). Optional: while absent, android
//                          tokens fail with "fcm not configured" and
//                          iOS delivery is completely unaffected.
// Built-ins already present: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Payload parity (privacy rule shared by both platforms): generic
// title only + the in-app deep-link route. No names, amounts, IDs, or
// any contract/identity data ever rides in a push.
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
const FCM_SA_RAW = Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "";
const BATCH = 50;

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------
// APNs (unchanged behavior)
// ---------------------------------------------------------------------

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

type SendOutcome = { ok: boolean; error?: string; tokenInvalid?: boolean };

async function sendApns(
  token: string,
  job: { title: string; route: string | null; notification_id: string },
): Promise<SendOutcome> {
  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
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
  if (res.ok) return { ok: true };
  const body = await res.text();
  return {
    ok: false,
    error: `apns ${res.status} ${body}`.slice(0, 300),
    tokenInvalid:
      res.status === 410 ||
      body.includes("BadDeviceToken") ||
      body.includes("Unregistered"),
  };
}

// ---------------------------------------------------------------------
// FCM HTTP v1 (android tokens)
// ---------------------------------------------------------------------
// OAuth2 service-account flow: sign an RS256 JWT with the service
// account's private key, exchange it for an access token, cache ~50min.

type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let fcmSa: FcmServiceAccount | null = null;
function fcmAccount(): FcmServiceAccount | null {
  if (fcmSa) return fcmSa;
  if (!FCM_SA_RAW) return null;
  try {
    const parsed = JSON.parse(FCM_SA_RAW) as FcmServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    fcmSa = parsed;
    return fcmSa;
  } catch {
    return null;
  }
}

let cachedFcmToken: { value: string; iat: number } | null = null;
async function fcmAccessToken(sa: FcmServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedFcmToken && nowSec - cachedFcmToken.iat < 50 * 60) {
    return cachedFcmToken.value;
  }
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`),
  ));
  const assertion = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`fcm oauth ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("fcm oauth: no access_token");
  cachedFcmToken = { value: data.access_token, iat: nowSec };
  return data.access_token;
}

async function sendFcm(
  token: string,
  job: { title: string; route: string | null; notification_id: string },
): Promise<SendOutcome> {
  const sa = fcmAccount();
  if (!sa) return { ok: false, error: "fcm not configured (FCM_SERVICE_ACCOUNT missing)" };
  const accessToken = await fcmAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          // Same privacy posture as APNs: generic title, no body.
          notification: { title: job.title },
          // FCM data values MUST be strings; the tap handler in
          // registerPush.ts reads data.route on both platforms.
          data: job.route ? { route: job.route } : {},
          android: {
            priority: "HIGH",
            collapse_key: job.notification_id,
            notification: { default_sound: true },
          },
        },
      }),
    },
  );
  if (res.ok) return { ok: true };
  const body = await res.text();
  return {
    ok: false,
    error: `fcm ${res.status} ${body}`.slice(0, 300),
    // UNREGISTERED = token no longer valid (app uninstalled / token
    // rotated); 404 covers the same condition on some responses.
    tokenInvalid: res.status === 404 || body.includes("UNREGISTERED"),
  };
}

// ---------------------------------------------------------------------

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
  // At least one delivery channel must be configured. APNs-only (the
  // pre-Android state) and APNs+FCM are both valid; FCM-only would be
  // too. Per-token failures are reported per job, never a crash.
  if ((!TEAM_ID || !KEY_ID || !PRIVATE_KEY) && !fcmAccount()) {
    return new Response(JSON.stringify({ error: "no push secrets configured (apns/fcm)" }), { status: 500 });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: jobs, error } = await sb
    .from("push_jobs").select("*").eq("status", "pending")
    .order("created_at").limit(BATCH);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0, failed = 0, tokensRevoked = 0;
  for (const job of jobs ?? []) {
    const { data: tokens } = await sb
      .from("push_device_tokens").select("token, platform")
      .eq("user_id", job.user_id).is("revoked_at", null);
    let delivered = false, lastError = "no active device tokens";
    for (const t of tokens ?? []) {
      try {
        const outcome = t.platform === "android"
          ? await sendFcm(t.token, job)
          : await sendApns(t.token, job);
        if (outcome.ok) { delivered = true; continue; }
        lastError = outcome.error ?? "send failed";
        // Stale/invalid token → revoke so we stop retrying it.
        if (outcome.tokenInvalid) {
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
