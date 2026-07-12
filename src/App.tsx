import { MobileShell } from '@/components/layout';
import {
  isMisconfiguredProduction,
  ProductionConfigError,
} from '@/components/auth/ProductionConfigGuard';
import { OfflineBanner } from '@/components/system/OfflineBanner';
import { SessionTimeoutManager } from '@/components/system/SessionTimeoutManager';
import { AppRoutes } from '@/routes';
import { isDemoMode, supabaseConfigured } from '@/lib/supabase';

export default function App() {
  // Phase 9 production safety: when the build is a PROD build and
  // Supabase isn't configured AND demo mode hasn't been explicitly
  // turned on (VITE_DEMO_MODE=true), render a clear configuration
  // error instead of letting empty-state screens stand in for missing
  // backend wiring. This is a single global guard — individual auth
  // pages keep their own guards for specific UX wording.
  if (isMisconfiguredProduction(supabaseConfigured) && !isDemoMode()) {
    return (
      <MobileShell>
        <ProductionConfigError />
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <AppRoutes />
      {/* Phase 1 session hardening — app-wide, render-null when idle-
          healthy. Mounted outside AppRoutes so the timers and the
          offline banner survive every navigation. */}
      <SessionTimeoutManager />
      <OfflineBanner />
    </MobileShell>
  );
}
