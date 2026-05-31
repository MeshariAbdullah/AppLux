import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, AuthLayout } from '@/components/layout';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';
import { RequireRole } from '@/components/auth/RequireRole';
import Home from '@/pages/Home';
import Eligibility from '@/pages/Eligibility';
import Stores from '@/pages/Stores';
import StoreDetails from '@/pages/StoreDetails';
import Contracts from '@/pages/Contracts';
import Notifications from '@/pages/Notifications';
import Profile from '@/pages/Profile';
import Scan from '@/pages/Scan';
import Review from '@/pages/Review';
import Approval from '@/pages/Approval';
import Tracking from '@/pages/Tracking';
import InvoiceTracking from '@/pages/InvoiceTracking';
import ContractTracking from '@/pages/ContractTracking';
import NoteTracking from '@/pages/NoteTracking';
import Welcome from '@/pages/auth/Welcome';
import AuthEntry from '@/pages/auth/AuthEntry';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import Nafath from '@/pages/auth/Nafath';
import RegisterSuccess from '@/pages/auth/RegisterSuccess';
import MerchantWelcome from '@/pages/merchant/MerchantWelcome';
import MerchantLogin from '@/pages/merchant/MerchantLogin';
import MerchantRegister from '@/pages/merchant/MerchantRegister';
import MerchantPending from '@/pages/merchant/MerchantPending';
import MerchantHome from '@/pages/merchant/MerchantHome';
import MerchantRentals from '@/pages/merchant/MerchantRentals';
import MerchantRentalDetails from '@/pages/merchant/MerchantRentalDetails';
import MerchantRentalContract from '@/pages/merchant/MerchantRentalContract';
import MerchantRentalNote from '@/pages/merchant/MerchantRentalNote';
import MerchantRentalClose from '@/pages/merchant/MerchantRentalClose';
import MerchantApprovals from '@/pages/merchant/MerchantApprovals';
import MerchantDamages from '@/pages/merchant/MerchantDamages';
import MerchantDamageNew from '@/pages/merchant/MerchantDamageNew';
import MerchantDamageDetails from '@/pages/merchant/MerchantDamageDetails';
import MerchantHistoryPage from '@/pages/merchant/MerchantHistoryPage';
import MerchantInvoiceNew from '@/pages/merchant/MerchantInvoiceNew';
import MerchantRentalSession from '@/pages/merchant/MerchantRentalSession';
import AdminHome from '@/pages/admin/AdminHome';
import AdminMerchants from '@/pages/admin/AdminMerchants';
import AdminMerchantDetails from '@/pages/admin/AdminMerchantDetails';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminUserDetails from '@/pages/admin/AdminUserDetails';
import AdminCases from '@/pages/admin/AdminCases';
import AdminCaseDetails from '@/pages/admin/AdminCaseDetails';
import AdminModulePlaceholder from '@/pages/admin/AdminModulePlaceholder';

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
  if (role === 'merchant') return <Navigate to="/merchant/home" replace />;
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
  return (
    <div className="min-h-screen grid place-items-center px-6 py-10 bg-canvas">
      <div className="max-w-sm w-full rounded-xl3 bg-white ring-1 ring-canvas-200 p-6 shadow-soft text-center space-y-3">
        <h1 className="editorial-title text-[20px] text-ink-900">
          We couldn't load your profile
        </h1>
        <p className="text-[13px] text-ink-500 leading-relaxed">
          Your session is active, but a profile fetch failed. Check your
          connection and try again.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => void onRetry()}
            className="w-full rounded-xl2 bg-lavender-600 text-white text-[13.5px] font-semibold py-2.5 hover:bg-lavender-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full text-[12.5px] text-ink-500 underline underline-offset-4 decoration-canvas-300"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
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
        <Route path="/merchant/welcome" element={<MerchantWelcome />} />
        <Route path="/merchant/login" element={<MerchantLogin />} />
        <Route path="/merchant/register" element={<MerchantRegister />} />

        {/* Merchant area — guarded by role */}
        <Route
          path="/merchant/pending"
          element={
            <RequireRole role="merchant" fallback="/merchant/welcome">
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
