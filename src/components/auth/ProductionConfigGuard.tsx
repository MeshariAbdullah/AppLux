import { Header, Screen } from '@/components/layout';
import { AlertIcon } from '@/components/icons';

/**
 * True when the build is a production build AND Supabase env vars
 * weren't inlined. Use this to refuse rendering the configured-auth
 * forms (Login, MerchantLogin, Register) — without this gate the
 * demo path runs silently in production, the user "signs in" via
 * setTimeout + navigate without a Supabase session, and the very
 * next backend-touching screen surfaces a confusing error.
 *
 * In dev the demo path remains available for local exploration.
 */
export function isMisconfiguredProduction(configured: boolean): boolean {
  return import.meta.env.PROD && !configured;
}

/**
 * Full-screen error rendered when isMisconfiguredProduction is true.
 * Mirrors the boot-time console.warn in client.ts but visible to
 * non-engineer users.
 */
export function ProductionConfigError() {
  return (
    <>
      <Header title="Configuration error" showBack />
      <Screen className="bg-canvas">
        <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-5 shadow-soft space-y-4">
          <div className="h-11 w-11 rounded-2xl bg-danger-50 text-danger-600 grid place-items-center ring-1 ring-danger-100">
            <AlertIcon size={20} />
          </div>
          <div>
            <h1 className="editorial-title text-[20px] text-ink-900 leading-tight">
              Supabase is not configured for this build
            </h1>
            <p className="mt-2 text-[13px] text-ink-500 leading-relaxed">
              This deployment was built without{' '}
              <code className="px-1 py-0.5 rounded bg-canvas-100 text-ink-800 num">
                VITE_SUPABASE_URL
              </code>{' '}
              or{' '}
              <code className="px-1 py-0.5 rounded bg-canvas-100 text-ink-800 num">
                VITE_SUPABASE_ANON_KEY
              </code>
              . Sign-in is disabled until those environment variables are
              set and the site is redeployed with a fresh build.
            </p>
          </div>
          <ul className="text-[12.5px] text-ink-500 leading-relaxed space-y-1.5 ps-4 list-disc">
            <li>Set both variables in the hosting provider's environment.</li>
            <li>Trigger a fresh deploy with the build cache cleared.</li>
            <li>
              Engineers: open DevTools and look for the{' '}
              <code className="px-1 py-0.5 rounded bg-canvas-100 text-ink-800 num">
                [applux] Supabase env vars not inlined…
              </code>{' '}
              warning.
            </li>
          </ul>
        </div>
      </Screen>
    </>
  );
}
