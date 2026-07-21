import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { useSupabaseAuth, type AppRole } from '@/lib/supabase';

function RouteLoadingFallback() {
  return (
    <div className="min-h-[40vh] grid place-items-center">
      <div className="h-8 w-8 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
    </div>
  );
}

type RequireRoleProps = {
  /** Single role or any-of list. Omit to require any authenticated role. */
  role?: AppRole | AppRole[];
  /**
   * Where to redirect when the visitor isn't allowed in.
   * Defaults to /welcome for customer routes; merchant/admin routes
   * pass /merchant/welcome or /welcome respectively.
   */
  fallback?: string;
  children: ReactElement;
};

/**
 * Role-aware route guard. Behaves differently depending on env:
 *
 *   * `configured === false` (Supabase env missing) — DEMO MODE:
 *     uses the legacy `useStore().session` flag. The merchant/admin
 *     route trees stay open (matching pre-Phase-3 demo behaviour),
 *     because demo seeds those sessions implicitly via the welcome
 *     entry buttons.
 *
 *   * `configured === true` — REAL MODE:
 *     gates on `useSupabaseAuth().status === 'authenticated'` and
 *     (when `role` is provided) on the Supabase profile role.
 */
export function RequireRole({
  role,
  fallback = '/welcome',
  children,
}: RequireRoleProps) {
  const {
    configured,
    status,
    session,
    role: actualRole,
    profile,
    profileLoading,
    profileError,
  } = useSupabaseAuth();
  const { session: demoSession } = useStore();

  // Demo mode: the existing useStore session is the only gate.
  // For routes that always allowed unauthenticated demo browsing
  // (merchant, admin) we just let everything through.
  if (!configured) {
    if (!role || role === 'customer') {
      return demoSession ? children : <Navigate to={fallback} replace />;
    }
    return children;
  }

  // Real mode
  if (status === 'loading') {
    // Render a tiny spinner instead of a blank screen — long boots
    // (e.g. cold Supabase regions) otherwise look like the app froze.
    return <RouteLoadingFallback />;
  }
  if (status !== 'authenticated') {
    return <Navigate to={fallback} replace />;
  }
  // Profile is loaded in the background after status flips to
  // 'authenticated'. Wait for it before evaluating the role — otherwise
  // `actualRole` is null and the role check would falsely fail.
  if (profileLoading) {
    return <RouteLoadingFallback />;
  }
  // Profile fetch failed (network, RLS, timeout). Hand off to RootRedirect
  // ('/'), which has the dedicated Retry / Sign-out UI for this state.
  if (profileError) {
    return <Navigate to="/" replace />;
  }
  if (role) {
    const allowed = Array.isArray(role) ? role.includes(actualRole!) : actualRole === role;
    if (!allowed) {
      return <Navigate to={fallback} replace />;
    }
  }
  // Bug 2 access guard: a CUSTOMER session whose email is not verified
  // may not enter operational routes — only the verification screen
  // (public route), resend/change-email, and sign-out. Merchants and
  // admins are exempt by design, and every account created while
  // auto-confirm was on carries email_confirmed_at/confirmed_at, so
  // existing verified customers are unaffected (compatibility rule:
  // block ONLY when BOTH confirmation timestamps are absent).
  if (
    actualRole === 'customer' &&
    session?.user &&
    !session.user.email_confirmed_at &&
    !session.user.confirmed_at
  ) {
    return <Navigate to="/auth/verify-email" replace />;
  }
  // Merchant separation M2: merchant accounts exist BEFORE approval
  // (role='merchant', account_status='pending'). Operational merchant
  // routes — role lists that include 'merchant' but NOT 'customer' —
  // additionally require the account to be ACTIVE. The application-
  // status page (/merchant/pending) includes 'customer' in its allow
  // list (legacy applicants), so this gate deliberately skips it.
  // account_status is admin/trigger-controlled and P0100-protected,
  // which is what makes it a trustworthy client-side signal; the
  // server-side equivalents are assert_merchant_active (P0110) + RLS.
  const requiredRoles = Array.isArray(role) ? role : role ? [role] : [];
  const isMerchantOperationalRoute =
    requiredRoles.includes('merchant') && !requiredRoles.includes('customer');
  if (
    isMerchantOperationalRoute &&
    actualRole === 'merchant' &&
    profile?.account_status !== 'active'
  ) {
    return <Navigate to="/merchant/pending" replace />;
  }
  return children;
}
