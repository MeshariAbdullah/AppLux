-- =====================================================================
-- Android push tokens — extend the platform check to FCM devices
-- =====================================================================
-- The push model is unchanged and stays shared across platforms:
--
--   public.notifications ──▶ public.push_jobs ──▶ push-dispatch ──▶
--     APNs  (platform = 'ios',     token = APNs device token)
--     FCM   (platform = 'android', token = FCM registration token)
--
-- push_device_tokens.platform was created (20260502124800) with an
-- inline CHECK allowing only 'ios'. The Android client registers
-- through the SAME register_push_token RPC with p_platform = 'android'
-- (the Capacitor push plugin yields an FCM token there), so the only
-- schema change needed is widening that CHECK. register_push_token /
-- revoke_push_token bodies need no change — they pass the platform
-- through, and this constraint remains the validator.
--
-- DEPLOY ORDER (Android push goes live only when ALL are done):
--   1. Apply this migration.
--   2. Configure Firebase manually (Android app for sa.lend.app,
--      google-services.json locally in android/app/, and the Firebase
--      service-account JSON stored as the FCM_SERVICE_ACCOUNT edge
--      function secret — never committed to git).
--   3. Redeploy the updated push-dispatch function (APNs + FCM).
-- Applying this migration alone is safe at any time: it only permits
-- 'android' rows; iOS delivery is untouched.
--
-- Idempotent. ROLLBACK: restore the previous constraint body
--   check (platform in ('ios'))
-- after deleting any android rows.
-- =====================================================================

alter table public.push_device_tokens
  drop constraint if exists push_device_tokens_platform_check;
alter table public.push_device_tokens
  add constraint push_device_tokens_platform_check
  check (platform in ('ios', 'android'));

comment on column public.push_device_tokens.platform is
  'Delivery platform for this device token: ios → APNs device token, android → FCM registration token. Drives the per-token delivery branch in the push-dispatch function.';

notify pgrst, 'reload schema';
