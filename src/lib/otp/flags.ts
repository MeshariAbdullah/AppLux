// =====================================================================
// OTP feature flags — PURE resolution logic (unit-tested directly).
// =====================================================================
// Two independent switches, one shared MSEGAT credential set on the
// backend:
//
//   Renter/session OTP delivery (merchant rental flow):
//     VITE_RENTER_OTP_PROVIDER = 'sms-edge' | 'rpc-inapp'
//     Falls back to the legacy VITE_OTP_PROVIDER (backward
//     compatible — existing deployments keep working unchanged).
//
//   Registration OTP (first-time signup mobile verification):
//     VITE_REGISTRATION_OTP_PROVIDER = 'sms-edge' → enabled
//     anything else / unset → disabled (signup behaves as before).
//
// These are UI/mode switches only — never credentials. Toggling either
// flag has no effect on the other flow.
// =====================================================================

export type OtpFlagEnv = {
  VITE_OTP_PROVIDER?: string;
  VITE_RENTER_OTP_PROVIDER?: string;
  VITE_REGISTRATION_OTP_PROVIDER?: string;
};

export type RenterOtpProvider = 'rpc-inapp' | 'sms-edge';

export function resolveRenterOtpProvider(env: OtpFlagEnv): RenterOtpProvider {
  const raw = env.VITE_RENTER_OTP_PROVIDER ?? env.VITE_OTP_PROVIDER;
  return raw === 'sms-edge' ? 'sms-edge' : 'rpc-inapp';
}

export function resolveRegistrationOtpEnabled(env: OtpFlagEnv): boolean {
  return env.VITE_REGISTRATION_OTP_PROVIDER === 'sms-edge';
}

/** The build-time env, funneled once so callers stay pure-testable. */
export function buildTimeOtpEnv(): OtpFlagEnv {
  return {
    VITE_OTP_PROVIDER: import.meta.env.VITE_OTP_PROVIDER,
    VITE_RENTER_OTP_PROVIDER: import.meta.env.VITE_RENTER_OTP_PROVIDER,
    VITE_REGISTRATION_OTP_PROVIDER: import.meta.env.VITE_REGISTRATION_OTP_PROVIDER,
  };
}
