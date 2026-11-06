// =====================================================================
// Customer suspension enforcement (20260502130800) — structural guards
// for the client half: error mapping, merchant wizard copy, the
// customer-shell banner, Review gating, locale parity, and the apply
// script carrying the migration verbatim behind the right preflight.
// The behavioural proof lives in
// supabase/tests/customer_suspension_enforcement_test.sql.
// Run: npm run test:suspension
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const ar = JSON.parse(read('src/locales/ar.json'));
const en = JSON.parse(read('src/locales/en.json'));
const arabic = (s) => /[؀-ۿ]/.test(s);

const migration = read('supabase/migrations/20260502130800_customer_suspension_enforcement.sql');
const apply = read('supabase/maintenance/apply_20260502130800_sql_editor.sql');
const errors = read('src/lib/errors.ts');
const otp = read('src/lib/otp/index.ts');
const wizard = read('src/pages/merchant/MerchantRentalSession.tsx');
const layout = read('src/components/layout/AppLayout.tsx');
const banner = read('src/components/system/SuspendedAccountBanner.tsx');
const review = read('src/pages/Review.tsx');
const photos = read('src/components/review/ReceiptPhotosStep.tsx');

test('migration: helper locks FOR SHARE, raises P0101, is internal, guards every new-obligation table first', () => {
  assert.match(migration, /create or replace function public\.assert_customer_active\(/);
  assert.match(migration, /for share;/);
  assert.match(migration, /using errcode = 'P0101'/);
  assert.match(migration, /revoke all on function public\.assert_customer_active\(uuid, text\) from anon, authenticated;/);
  for (const trg of [
    'rental_invoices_a0_guard_suspended_customer',
    'rental_contracts_a0_guard_suspended_customer',
    'renter_otp_challenges_a0_guard_suspended_customer',
  ]) {
    assert.ok(migration.includes(`create trigger ${trg}`), trg);
  }
  assert.match(migration, /before insert or update of status on public\.rental_invoices/);
  assert.match(migration, /before insert or update of status, receipt_photos_confirmed_at, handover_at\s+on public\.rental_contracts/);
  assert.match(migration, /before insert on public\.renter_otp_challenges/);
  // merchant entry points reject before any side effect
  assert.match(migration, /lookup_renter_by_mobile[\s\S]*assert_customer_active\(v_customer, 'renter_lookup'\)/);
  assert.match(migration, /merchant_start_renter_otp[\s\S]*assert_customer_active\(v_customer, 'renter_verification'\)/);
  // an ACTIVE rental is never trapped: handover/receipt gate only on pending rows
  assert.match(migration, /if old\.status = 'pending' and \(/);
  // scope: no policy, table grant, session, auth or profile-row change
  assert.doesNotMatch(migration, /create policy|alter policy|drop policy/i);
  assert.doesNotMatch(migration, /grant .* on table|revoke .* on table/i);
  assert.doesNotMatch(migration, /auth\.users|auth\.sessions|refresh_tokens|banned_until/i);
  assert.doesNotMatch(migration, /update public\.profiles|update profiles/i);
});

test('apply script: staging-only preflight expects exactly 68 prior rows and carries the migration verbatim', () => {
  assert.match(apply, /v_env is distinct from 'staging'/);
  assert.match(apply, /between '20260502120000' and '20260502130700'/);
  assert.match(apply, /if v_hist <> 68 then/);
  assert.match(apply, /where version = '20260502130800'/);
  assert.ok(apply.includes(migration.trim()), 'migration body must be embedded verbatim');
  assert.match(apply, /values \('20260502130800', 'customer_suspension_enforcement'\)/);
  assert.match(apply, /'69'/);
});

test('client maps P0101 to the suspension copy on both sides', () => {
  assert.match(errors, /if \(code === 'P0101'\) return t\('errors\.customerSuspended'\);/);
  assert.match(otp, /if \(code === 'P0101'\) return new OtpError\('customer_suspended', message\);/);
  assert.match(otp, /\| 'customer_suspended'/);
  assert.match(wizard, /code === 'P0101'/);
  assert.match(wizard, /merchant\.session\.verify\.errors\.customerSuspended/);
  assert.match(wizard, /case 'customer_suspended':/);
});

test('customer shell shows the banner from the DB status and never redirects', () => {
  assert.match(layout, /<SuspendedAccountBanner \/>/);
  const merchantShell = layout.slice(layout.indexOf('export function MerchantAppLayout'));
  assert.doesNotMatch(merchantShell, /SuspendedAccountBanner/, 'merchant shell untouched');
  assert.match(banner, /profile\.account_status === 'suspended'/);
  assert.match(banner, /profile\?\.role === 'customer'/);
  assert.doesNotMatch(banner, /Navigate|navigate\(/);
  for (const key of [
    'title', 'summary', 'details', 'hide', 'noNewRentals', 'existingAccessible',
    'viewContracts', 'contactSupport', 'contactSupportFallback',
  ]) {
    assert.ok(banner.includes(`suspension.banner.${key}`), key);
  }
  assert.match(banner, /to="\/contracts"/);
});

test('Review disables accept/activate for a suspended customer but keeps rejection available', () => {
  assert.match(review, /const suspended = configured && supabaseProfile\?\.account_status === 'suspended';/);
  assert.equal((review.match(/suspended=\{suspended\}/g) || []).length, 2, 'ConfirmStep and ReceiptPhotosStep');
  assert.match(review, /if \(!allAccepted \|\| processing \|\| blocked \|\| suspended\) return;/);
  assert.match(review, /disabled=\{!allAccepted \|\| processing \|\| blocked \|\| suspended\}/);
  assert.match(review, /suspension\.review\.notice/);
  // the reject CTA condition must not depend on suspension
  assert.match(review, /\{onRejectRequest && !processing && \(/);
  assert.match(photos, /disabled=\{suspended \|\| \(locked \? finalizing : !canConfirm\)\}/);
  assert.match(photos, /suspension\.review\.photosNotice/);
});

test('locale copy exists in Arabic and English for every new key', () => {
  const walk = (o, prefix = '') =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'string' ? [[prefix + k, v]] : walk(v, prefix + k + '.'));
  const arKeys = Object.fromEntries(walk(ar.suspension, 'suspension.'));
  const enKeys = Object.fromEntries(walk(en.suspension, 'suspension.'));
  assert.deepEqual(Object.keys(arKeys), Object.keys(enKeys));
  assert.ok(Object.keys(arKeys).length >= 11);
  for (const [k, v] of Object.entries(arKeys)) assert.ok(arabic(v), `ar not arabic: ${k}`);
  for (const [k, v] of Object.entries(enKeys)) assert.ok(!arabic(v), `en has arabic: ${k}`);
  assert.ok(arabic(ar.errors.customerSuspended) && !arabic(en.errors.customerSuspended));
  assert.ok(
    arabic(ar.merchant.session.verify.errors.customerSuspended) &&
      !arabic(en.merchant.session.verify.errors.customerSuspended),
  );
  // the notice tells the customer what stays available and how to get help
  assert.match(en.suspension.banner.existingAccessible, /contracts/i);
  assert.match(en.suspension.banner.contactSupport, /support/i);
});
