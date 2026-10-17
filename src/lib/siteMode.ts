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

/** Canonical production hosts (DNS → the production Vercel project). */
export const APP_HOSTNAME = 'app.lend.sa';

/** The permanent staging/testing host (the original Vercel URL). */
export const STAGING_HOSTNAME = 'lendsa.vercel.app';

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

// ---------------------------------------------------------------------
// Deploy environment — production vs staging labeling. Independent of
// the site mode: it never changes WHAT is served, only whether the UI
// carries the small staging marker (and lets diagnostics name the
// environment). Resolution:
//   1. native Capacitor            → 'production' (the shipped app
//      never shows a staging marker, whatever env leaked in)
//   2. VITE_DEPLOY_ENV staging/production → explicit per-project value
//   3. hostname lendsa.vercel.app  → 'staging' (backstop: the staging
//      host is labeled even if the env var is forgotten)
//   4. otherwise                   → 'production' (which simply means
//      "no staging marker" — dev/localhost stays unlabeled)
// ---------------------------------------------------------------------

export type DeployEnv = 'production' | 'staging';

export type DeployEnvEnv = { VITE_DEPLOY_ENV?: string };

export function resolveDeployEnv(
  env: DeployEnvEnv,
  runtime: { isNative: boolean; hostname: string },
): DeployEnv {
  if (runtime.isNative) return 'production';
  if (env.VITE_DEPLOY_ENV === 'staging') return 'staging';
  if (env.VITE_DEPLOY_ENV === 'production') return 'production';
  if ((runtime.hostname || '').toLowerCase() === STAGING_HOSTNAME) return 'staging';
  return 'production';
}
