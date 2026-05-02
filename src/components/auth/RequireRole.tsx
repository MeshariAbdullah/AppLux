import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useStore } from '@/lib/store';
import { useSupabaseAuth, type AppRole } from '@/lib/supabase';

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
  const { configured, status, role: actualRole } = useSupabaseAuth();
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
    // Avoid flashing a redirect while the session is hydrating.
    return null;
  }
  if (status !== 'authenticated') {
    return <Navigate to={fallback} replace />;
  }
  if (role) {
    const allowed = Array.isArray(role) ? role.includes(actualRole!) : actualRole === role;
    if (!allowed) {
      return <Navigate to={fallback} replace />;
    }
  }
  return children;
}
