// =====================================================================
// Site mode — which product surface this running app presents.
//
//   'full'     → customer + merchant + admin (the mobile app and the
//                default web deployment). Today's behavior, unchanged.
//   'business' → merchant-only web portal (business.lend.sa): only the
//                merchant area plus the shared auth utility routes are
//                REGISTERED — customer/admin routes do not exist there.
//
// Resolution order (first match wins), applied by the caller through
// resolveSiteMode so this module stays pure and unit-testable:
//
//   1. Native Capacitor shell        → ALWAYS 'full'. The shipped app
//      binary can never lose a role to a build-env mistake (the
//      registration-OTP incident class).
//   2. Hostname business.lend.sa     → ALWAYS 'business'. Runtime
//      backstop: even if the Vercel project forgot VITE_SITE_MODE,
//      the business domain can only get MORE restricted, never leak
//      customer UI (fail closed).
//   3. VITE_SITE_MODE=business       → 'business'. The explicit,
//      testable primary switch for the business deployment.
//   4. Otherwise                     → 'full'.
//
// CONSUMPTION RULE (structural-test enforced): the resolved mode is
// read ONLY by routes.tsx (route registration + root routing). Feature
// pages and lib modules must never branch on it — that is how the
// codebase stays one product with two doors instead of two products.
// =====================================================================

export type SiteMode = 'full' | 'business';

export const BUSINESS_HOSTNAME = 'business.lend.sa';

export type SiteModeEnv = { VITE_SITE_MODE?: string };

export function resolveSiteMode(
  env: SiteModeEnv,
  runtime: { isNative: boolean; hostname: string },
): SiteMode {
  if (runtime.isNative) return 'full';
  const host = (runtime.hostname || '').toLowerCase();
  if (host === BUSINESS_HOSTNAME || host.endsWith(`.${BUSINESS_HOSTNAME}`)) {
    return 'business';
  }
  if (env.VITE_SITE_MODE === 'business') return 'business';
  return 'full';
}
