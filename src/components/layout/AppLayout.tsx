import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
