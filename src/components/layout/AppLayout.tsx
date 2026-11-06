import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { MerchantTabBar } from '@/components/merchant/MerchantTabBar';
import { SuspendedAccountBanner } from '@/components/system/SuspendedAccountBanner';

/** Customer shell. The suspended-account notice (20260502130800) is a
 *  static row between the page and the bottom nav — visible on every
 *  customer page, never a redirect: existing contracts, invoices and
 *  disputes stay reachable while new obligations are refused. */
export function AppLayout() {
  return (
    <>
      <Outlet />
      <SuspendedAccountBanner />
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
