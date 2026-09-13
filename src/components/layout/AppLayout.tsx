import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { MerchantTabBar } from '@/components/merchant/MerchantTabBar';

export function AppLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

/** Merchant mirror of AppLayout: ONE place renders the merchant tab
 *  bar as the shell's last row, so it is fixed and identical on every
 *  authenticated merchant page — pages never mount their own copy
 *  (the old per-page sticky bars appeared on only three surfaces and
 *  behaved differently per page/scroll). Auth/onboarding routes stay
 *  outside this layout and show no nav. */
export function MerchantAppLayout() {
  return (
    <>
      <Outlet />
      <MerchantTabBar />
    </>
  );
}
