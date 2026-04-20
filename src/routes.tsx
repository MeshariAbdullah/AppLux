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
import Welcome from '@/pages/auth/Welcome';
import AuthEntry from '@/pages/auth/AuthEntry';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import Nafath from '@/pages/auth/Nafath';
import RegisterSuccess from '@/pages/auth/RegisterSuccess';

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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
