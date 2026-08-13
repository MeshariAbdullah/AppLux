// =====================================================================
// APNs registration + tap deep-linking (native iOS only; a silent
// no-op on the web). Server-authoritative ownership: the token is
// stored via the register_push_token RPC under the SIGNED-IN user —
// re-registration moves a device to its current user, sign-out
// best-effort revokes. Notification taps navigate only to whitelisted
// in-app dispute routes carried in the payload; nothing sensitive is
// ever in the push itself.
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { logEvent } from '@/lib/observability/log';
import { requireSupabase } from '@/lib/supabase/client';

let started = false;
let lastToken: string | null = null;

const ROUTE_WHITELIST = [/^\/disputes\/[a-f0-9-]+$/i, /^\/merchant\/damages\/[a-f0-9-]+$/i];

export async function startPushRegistration(
  navigate: (to: string) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.addListener('registration', (t) => {
      lastToken = t.value;
      const sb = requireSupabase();
      sb.rpc('register_push_token', { p_token: t.value, p_platform: 'ios' }).then(
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
