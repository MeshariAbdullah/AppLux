// =====================================================================
// Push registration + tap deep-linking (native platforms only; a
// silent no-op on the web). The same Capacitor plugin yields an APNs
// token on iOS and an FCM token on Android — the REAL platform is
// reported to register_push_token so the dispatcher can route
// delivery per platform.
//
// NOTE (Android rollout): until the backend push phase lands
// (push_device_tokens platform check extended to 'android' + an FCM
// branch in the push-dispatch function), Android registration is
// expected to fail server-side with a check-constraint error — logged
// as a warn, never surfaced. iOS behavior is unchanged.
//
// Server-authoritative ownership: the token is stored via the
// register_push_token RPC under the SIGNED-IN user — re-registration
// moves a device to its current user, sign-out best-effort revokes.
// Notification taps navigate only to whitelisted in-app routes
// carried in the payload; nothing sensitive is ever in the push.
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { logEvent } from '@/lib/observability/log';
import { requireSupabase } from '@/lib/supabase/client';

let started = false;
let lastToken: string | null = null;

// Exact real routes only (see routes.tsx) — anything else is ignored.
const ROUTE_WHITELIST = [
  /^\/disputes\/[a-f0-9-]+$/i,
  /^\/merchant\/damages\/[a-f0-9-]+$/i,
  /^\/review\/[A-Za-z0-9_-]+$/,
  /^\/notifications$/,
  /^\/merchant\/notifications$/,
];

export async function startPushRegistration(
  navigate: (to: string) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    // Retry-safe: drop any listeners from a previous (failed) attempt
    // so re-invocation never stacks duplicate handlers.
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', (t) => {
      lastToken = t.value;
      const sb = requireSupabase();
      // 'ios' → APNs token, 'android' → FCM token. The platform value
      // drives per-platform delivery in the dispatcher.
      const platform = Capacitor.getPlatform() === 'android' ? 'android' : 'ios';
      sb.rpc('register_push_token', { p_token: t.value, p_platform: platform }).then(
        ({ error }) => {
          if (error) logEvent('rpc_failure', 'warn', { op: 'register_push_token' }, error);
        },
      );
    });
    await PushNotifications.addListener('registrationError', (e) => {
      // Transient APNs failure: unlatch so the next auth/focus pass
      // retries registration instead of being suppressed forever.
      started = false;
      logEvent('rpc_failure', 'warn', { op: 'push_registration_error' }, e);
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const route = (action.notification?.data as { route?: unknown })?.route;
      if (typeof route === 'string' && ROUTE_WHITELIST.some((r) => r.test(route))) {
        navigate(route);
      }
    });
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted') await PushNotifications.register();
  } catch (err) {
    // Recoverable startup failure (plugin import, permission API):
    // unlatch so a later invocation retries — `started` must never
    // permanently suppress registration after a failure.
    started = false;
    logEvent('rpc_failure', 'warn', { op: 'push_bootstrap' }, err);
  }
}

/** Best-effort server-side revocation on sign-out. */
export async function revokePushToken(): Promise<void> {
  if (!lastToken) return;
  try {
    await requireSupabase().rpc('revoke_push_token', { p_token: lastToken });
  } catch {
    /* best-effort */
  }
}
