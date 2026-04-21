import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, AuthLayout } from '@/components/layout';
import { useStore } from '@/lib/store';
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
import AdminHome from '@/pages/admin/AdminHome';
import AdminMerchants from '@/pages/admin/AdminMerchants';
import AdminMerchantDetails from '@/pages/admin/AdminMerchantDetails';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminUserDetails from '@/pages/admin/AdminUserDetails';
import AdminCases from '@/pages/admin/AdminCases';
import AdminModulePlaceholder from '@/pages/admin/AdminModulePlaceholder';

function RequireAuth({ children }: { children: ReactElement }) {
  const { session } = useStore();
  return session ? children : <Navigate to="/welcome" replace />;
}

function RootRedirect() {
  const { session } = useStore();
  return <Navigate to={session ? '/home' : '/welcome'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route element={<AuthLayout />}>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/auth" element={<AuthEntry />} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />
        <Route path="/auth/nafath" element={<Nafath />} />
        <Route path="/auth/success" element={<RegisterSuccess />} />
        <Route path="/merchant/welcome" element={<MerchantWelcome />} />
        <Route path="/merchant/login" element={<MerchantLogin />} />
        <Route path="/merchant/register" element={<MerchantRegister />} />
        <Route path="/merchant/pending" element={<MerchantPending />} />
        <Route path="/merchant/home" element={<MerchantHome />} />
        <Route path="/merchant/rentals" element={<MerchantRentals />} />
        <Route path="/merchant/rentals/:id" element={<MerchantRentalDetails />} />
        <Route
          path="/merchant/rentals/:id/contract"
          element={<MerchantRentalContract />}
        />
        <Route path="/merchant/rentals/:id/note" element={<MerchantRentalNote />} />
        <Route path="/merchant/rentals/:id/close" element={<MerchantRentalClose />} />
        <Route
          path="/merchant/rentals/:id/damage/new"
          element={<MerchantDamageNew />}
        />
        <Route path="/merchant/approvals" element={<MerchantApprovals />} />
        <Route path="/merchant/damages" element={<MerchantDamages />} />
        <Route path="/merchant/damages/:id" element={<MerchantDamageDetails />} />
        <Route path="/merchant/history" element={<MerchantHistoryPage />} />
        <Route path="/merchant/invoice/new" element={<MerchantInvoiceNew />} />
        <Route path="/admin/home" element={<AdminHome />} />
        <Route path="/admin/merchants" element={<AdminMerchants />} />
        <Route path="/admin/merchants/:id" element={<AdminMerchantDetails />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/users/:id" element={<AdminUserDetails />} />
        <Route path="/admin/limits" element={<AdminModulePlaceholder />} />
        <Route path="/admin/cases" element={<AdminCases />} />
        <Route path="/admin/overdue" element={<AdminModulePlaceholder />} />
        <Route path="/admin/reports" element={<AdminModulePlaceholder />} />
        <Route path="/admin/audit" element={<AdminModulePlaceholder />} />
        <Route path="/admin/support" element={<AdminModulePlaceholder />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
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
