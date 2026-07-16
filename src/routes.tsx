import { Suspense, useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, AuthLayout } from '@/components/layout';
import { useT } from '@/lib/i18n';
import { lazyWithReload } from '@/lib/lazyWithReload';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';
import { RequireRole } from '@/components/auth/RequireRole';

// =====================================================================
// Phase 5B route loading strategy.
//
// EAGER (entry chunk) — the first-paint path for every role: Welcome,
// AuthEntry, Login, Register, Home, RootRedirect, layouts, and guards.
// No role's first screen ever waits on a second chunk request.
//
// LAZY — everything else, grouped by vite.config.ts manualChunks into
// three role chunks (pages-customer-flows / pages-merchant /
// pages-admin) so 40+ pages don't become 40+ requests. All lazy pages
// load through lazyWithReload, which handles the stale-deploy chunk-
// 404 with a one-shot reload; a second failure surfaces the Phase 2
// crash screen. RootRedirect prefetches the signed-in role's group in
// idle time, so the dashboard chunk is usually warm before first tap.
// =====================================================================

import Home from '@/pages/Home';
import Welcome from '@/pages/auth/Welcome';
import AuthEntry from '@/pages/auth/AuthEntry';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';

// ---- Lazy: customer flows + secondary auth ----
const Eligibility = lazyWithReload(() => import('@/pages/Eligibility'));
const Stores = lazyWithReload(() => import('@/pages/Stores'));
const StoreDetails = lazyWithReload(() => import('@/pages/StoreDetails'));
const Contracts = lazyWithReload(() => import('@/pages/Contracts'));
const Notifications = lazyWithReload(() => import('@/pages/Notifications'));
const Profile = lazyWithReload(() => import('@/pages/Profile'));
const Scan = lazyWithReload(() => import('@/pages/Scan'));
const Review = lazyWithReload(() => import('@/pages/Review'));
const Approval = lazyWithReload(() => import('@/pages/Approval'));
const Tracking = lazyWithReload(() => import('@/pages/Tracking'));
const InvoiceTracking = lazyWithReload(() => import('@/pages/InvoiceTracking'));
const ContractTracking = lazyWithReload(() => import('@/pages/ContractTracking'));
const NoteTracking = lazyWithReload(() => import('@/pages/NoteTracking'));
const Diagnostics = lazyWithReload(() => import('@/pages/Diagnostics'));
const Nafath = lazyWithReload(() => import('@/pages/auth/Nafath'));
const RegisterSuccess = lazyWithReload(() => import('@/pages/auth/RegisterSuccess'));
const ForgotPassword = lazyWithReload(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazyWithReload(() => import('@/pages/auth/ResetPassword'));

// ---- Lazy: merchant area ----
const MerchantWelcome = lazyWithReload(() => import('@/pages/merchant/MerchantWelcome'));
const MerchantLogin = lazyWithReload(() => import('@/pages/merchant/MerchantLogin'));
const MerchantRegister = lazyWithReload(() => import('@/pages/merchant/MerchantRegister'));
const MerchantPending = lazyWithReload(() => import('@/pages/merchant/MerchantPending'));
const MerchantHome = lazyWithReload(() => import('@/pages/merchant/MerchantHome'));
const MerchantRentals = lazyWithReload(() => import('@/pages/merchant/MerchantRentals'));
const MerchantRentalDetails = lazyWithReload(() => import('@/pages/merchant/MerchantRentalDetails'));
const MerchantRentalContract = lazyWithReload(() => import('@/pages/merchant/MerchantRentalContract'));
const MerchantRentalNote = lazyWithReload(() => import('@/pages/merchant/MerchantRentalNote'));
const MerchantRentalClose = lazyWithReload(() => import('@/pages/merchant/MerchantRentalClose'));
const MerchantApprovals = lazyWithReload(() => import('@/pages/merchant/MerchantApprovals'));
const MerchantDamages = lazyWithReload(() => import('@/pages/merchant/MerchantDamages'));
const MerchantDamageNew = lazyWithReload(() => import('@/pages/merchant/MerchantDamageNew'));
const MerchantDamageDetails = lazyWithReload(() => import('@/pages/merchant/MerchantDamageDetails'));
const MerchantHistoryPage = lazyWithReload(() => import('@/pages/merchant/MerchantHistoryPage'));
const MerchantProfile = lazyWithReload(() => import('@/pages/merchant/MerchantProfile'));
const MerchantInvoiceNew = lazyWithReload(() => import('@/pages/merchant/MerchantInvoiceNew'));
const MerchantRentalSession = lazyWithReload(() => import('@/pages/merchant/MerchantRentalSession'));

// ---- Lazy: admin area ----
const AdminHome = lazyWithReload(() => import('@/pages/admin/AdminHome'));
const AdminMerchants = lazyWithReload(() => import('@/pages/admin/AdminMerchants'));
const AdminMerchantDetails = lazyWithReload(() => import('@/pages/admin/AdminMerchantDetails'));
const AdminUsers = lazyWithReload(() => import('@/pages/admin/AdminUsers'));
const AdminUserDetails = lazyWithReload(() => import('@/pages/admin/AdminUserDetails'));
const AdminCases = lazyWithReload(() => import('@/pages/admin/AdminCases'));
const AdminCaseDetails = lazyWithReload(() => import('@/pages/admin/AdminCaseDetails'));
const AdminModulePlaceholder = lazyWithReload(() => import('@/pages/admin/AdminModulePlaceholder'));

function RequireCustomer({ children }: { children: ReactElement }) {
  return (
    <RequireRole role={['customer', 'admin']} fallback="/welcome">
      {children}
    </RequireRole>
  );
}

/**
 * Single role-routing decision point for the whole app.
 *
 * Driven entirely by provider state (`useSupabaseAuth().status` +
 * `.role`). Login / sign-up pages do NOT duplicate this logic — once
 * their post-auth effect sees `status === 'authenticated'`, they
 * navigate to '/' and hand off to this component, which is the only
 * place that maps role → home.
 *
 * Loading window: `status` flips to 'authenticated' as soon as the
 * session is known, but `profileLoading` is still true while the
 * profile row is being fetched. We render a brief spinner in that
 * window instead of falling through to "no profile → /welcome".
 *
 * Failure branches:
 *   - configured, authenticated, profile fetch errored (incl. timeout)
 *     → render a recoverable error view with Retry / Sign out.
 *   - configured, authenticated, profile load finished, profile null
 *     → genuine "this user has no profile row" — go to /welcome.
 */
function RootRedirect() {
  const {
    configured,
    status,
    role,
    profile,
    profileError,
    profileLoading,
    refresh,
    signOut,
  } = useSupabaseAuth();
  const { session: demoSession } = useStore();

  // Phase 5B: warm the signed-in role's page-group chunk in idle time
  // so the first tap after the redirect doesn't wait on a request.
  // Fire-and-forget — a failed prefetch is ignored; on-demand loading
  // through lazyWithReload remains the real path.
  useEffect(() => {
    if (!configured || !role) return;
    const prefetch =
      role === 'admin'
        ? () => import('@/pages/admin/AdminHome')
        : role === 'merchant'
          ? () => import('@/pages/merchant/MerchantHome')
          : () => import('@/pages/Contracts');
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => void;
    };
    const idle = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 250));
    idle(() => void prefetch().catch(() => {}));
  }, [configured, role]);

  if (!configured) {
    return <Navigate to={demoSession ? '/home' : '/welcome'} replace />;
  }
  if (status === 'loading') return <RouteSpinner />;
  if (status !== 'authenticated') return <Navigate to="/welcome" replace />;
  if (profileLoading) return <RouteSpinner />;
  if (profileError) {
    return <ProfileLoadError onRetry={refresh} onSignOut={signOut} />;
  }
  if (!profile) {
    // Authenticated but profile row missing entirely — push back to
    // /welcome rather than loop.
    return <Navigate to="/welcome" replace />;
  }
  if (role === 'merchant') {
    // Merchant separation M2: pending/rejected merchant accounts land
    // on their application-status page, never the dashboard. The
    // account_status flip to 'active' happens only at admin approval.
    return profile.account_status === 'active' ? (
      <Navigate to="/merchant/home" replace />
    ) : (
      <Navigate to="/merchant/pending" replace />
    );
  }
  if (role === 'admin') return <Navigate to="/admin/home" replace />;
  return <Navigate to="/home" replace />;
}

function RouteSpinner() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="h-8 w-8 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
    </div>
  );
}

function ProfileLoadError({
  onRetry,
  onSignOut,
}: {
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const t = useT();
  return (
    <div className="min-h-screen grid place-items-center px-6 py-10 bg-canvas">
      <div className="max-w-sm w-full rounded-xl3 bg-white ring-1 ring-canvas-200 p-6 shadow-soft text-center space-y-3">
        <h1 className="editorial-title text-[20px] text-ink-900">
          {t('errors.profileLoad.title')}
        </h1>
        <p className="text-[13px] text-ink-500 leading-relaxed">
          {t('errors.profileLoad.body')}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => void onRetry()}
            className="w-full rounded-xl2 bg-lavender-600 text-white text-[13.5px] font-semibold py-2.5 hover:bg-lavender-700"
          >
            {t('errors.profileLoad.retryCta')}
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full text-[12.5px] text-ink-500 underline underline-offset-4 decoration-canvas-300"
          >
            {t('errors.profileLoad.signOutCta')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    // One Suspense boundary for every lazy route: a loading chunk shows
    // the same RouteSpinner used for auth/profile waits — never a blank
    // screen. Sits INSIDE AppErrorBoundary (App.tsx), so a chunk that
    // fails even after lazyWithReload's one-shot reload renders the
    // crash screen with a support code.
    <Suspense fallback={<RouteSpinner />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

      <Route element={<AuthLayout />}>
        {/* Public auth screens */}
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/auth" element={<AuthEntry />} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />
        <Route path="/auth/nafath" element={<Nafath />} />
        <Route path="/auth/success" element={<RegisterSuccess />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/merchant/welcome" element={<MerchantWelcome />} />
        <Route path="/merchant/login" element={<MerchantLogin />} />
        <Route path="/merchant/register" element={<MerchantRegister />} />

        {/* Merchant area — guarded by role */}
        {/* Application-status page: in live mode the applicant is still
            a CUSTOMER until the admin provisions the approved
            application, so the guard must admit customers too — the
            page itself routes provisioned merchants to the dashboard
            and users with no application back to /merchant/welcome. */}
        <Route
          path="/merchant/pending"
          element={
            <RequireRole role={['customer', 'merchant']} fallback="/merchant/welcome">
              <MerchantPending />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/home"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantHome />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/rentals"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantRentals />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/rentals/:id"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantRentalDetails />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/rentals/:id/contract"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantRentalContract />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/rentals/:id/note"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantRentalNote />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/rentals/:id/close"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantRentalClose />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/rentals/:id/damage/new"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantDamageNew />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/approvals"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantApprovals />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/damages"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantDamages />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/damages/:id"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantDamageDetails />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/history"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantHistoryPage />
            </RequireRole>
          }
        />
        {/* Design D1 — "حسابي" tab: store profile, business info,
            support, sign-out, release line + diagnostics gesture. */}
        <Route
          path="/merchant/profile"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantProfile />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/invoice/new"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantInvoiceNew />
            </RequireRole>
          }
        />
        <Route
          path="/merchant/session/new"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
              <MerchantRentalSession />
            </RequireRole>
          }
        />

        {/* Admin area — guarded by role */}
        <Route
          path="/admin/home"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminHome />
            </RequireRole>
          }
        />
        <Route
          path="/admin/merchants"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminMerchants />
            </RequireRole>
          }
        />
        <Route
          path="/admin/merchants/:id"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminMerchantDetails />
            </RequireRole>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminUsers />
            </RequireRole>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminUserDetails />
            </RequireRole>
          }
        />
        <Route
          path="/admin/limits"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminModulePlaceholder />
            </RequireRole>
          }
        />
        <Route
          path="/admin/cases"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminCases />
            </RequireRole>
          }
        />
        <Route
          path="/admin/cases/:kind/:id"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminCaseDetails />
            </RequireRole>
          }
        />
        <Route
          path="/admin/overdue"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminModulePlaceholder />
            </RequireRole>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminModulePlaceholder />
            </RequireRole>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminModulePlaceholder />
            </RequireRole>
          }
        />
        <Route
          path="/admin/support"
          element={
            <RequireRole role="admin" fallback="/welcome">
              <AdminModulePlaceholder />
            </RequireRole>
          }
        />
      </Route>

      {/* Customer area */}
      <Route
        element={
          <RequireCustomer>
            <AppLayout />
          </RequireCustomer>
        }
      >
        <Route path="/home" element={<Home />} />
        <Route path="/eligibility" element={<Eligibility />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/stores/:id" element={<StoreDetails />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/review/:token" element={<Review />} />
        <Route path="/approval/:token" element={<Approval />} />
        <Route path="/tracking/:token" element={<Tracking />} />
        <Route path="/track/invoice/:id" element={<InvoiceTracking />} />
        <Route path="/track/contract/:id" element={<ContractTracking />} />
        <Route path="/track/note/:id" element={<NoteTracking />} />
      </Route>

      {/* Phase 6C hidden diagnostics — reachable by direct URL or the
          seven-tap version-row gesture. Deliberately outside every
          layout and role guard: anonymous visitors get the release +
          connectivity subset, signed-in users additionally see their
          role. The page itself enforces that split. */}
      <Route path="/diagnostics" element={<Diagnostics />} />

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
