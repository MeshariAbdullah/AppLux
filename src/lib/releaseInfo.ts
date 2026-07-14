// =====================================================================
// Release metadata — Phase 6A. Single source consumed by the logger,
// the crash screen, and (later) the diagnostics page / 6B transport.
//
// Values are injected at BUILD time by vite.config.ts `define`:
//   * version — package.json version
//   * commit  — VERCEL_GIT_COMMIT_SHA (preview/production) or local
//               `git rev-parse`, shortened to 7 chars; 'unknown' when
//               neither is available. Never a secret.
//   * env     — normalized: 'production' | 'preview' | 'local'
//   * builtAt — build timestamp (ISO)
//
// 'capacitor' is detected at RUNTIME (the same web build ships inside
// the iOS wrapper). The real iOS build number is deliberately NOT
// duplicated here — it lives in the native project and joins the
// release line during the TestFlight workflow.
// =====================================================================

declare const __LEND_RELEASE__:
  | { version: string; commit: string; env: string; builtAt: string }
  | undefined;

export type ReleaseEnv = 'local' | 'preview' | 'production' | 'capacitor';

type ReleaseInfo = {
  version: string;
  commit: string;
  env: ReleaseEnv;
  builtAt: string;
};

function detectCapacitor(): boolean {
  try {
    const w = window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    return Boolean(w.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function normalizeEnv(env: string): ReleaseEnv {
  if (env === 'production' || env === 'preview') return env;
  return 'local';
}

export const releaseInfo: Readonly<ReleaseInfo> = Object.freeze(
  (() => {
    const base =
      typeof __LEND_RELEASE__ !== 'undefined'
        ? __LEND_RELEASE__
        : { version: '0.0.0', commit: 'unknown', env: 'local', builtAt: '' };
    return {
      version: base.version,
      commit: base.commit,
      env: detectCapacitor() ? ('capacitor' as const) : normalizeEnv(base.env),
      builtAt: base.builtAt,
    };
  })(),
);

/** e.g. "Version 0.1.0 · 0169f76 · preview" (without the word). */
export const releaseLine = `${releaseInfo.version} · ${releaseInfo.commit} · ${releaseInfo.env}`;
