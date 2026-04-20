import { Navigate, Route, Routes } from 'react-router-dom';
import Home from '@/pages/Home';
import Contracts from '@/pages/Contracts';
import Notifications from '@/pages/Notifications';
import Profile from '@/pages/Profile';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/contracts" element={<Contracts />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
