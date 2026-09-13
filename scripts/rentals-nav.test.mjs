// =====================================================================
// Rentals list navigation — structural guards (npm run test:rentals).
// Real-device regression: "مراجعة" on /contracts routed pending offers
// to the READ-ONLY tracking page, so the customer could never enter
// the approval flow from the rentals list.
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const contracts = readFileSync(path.join(root, 'src/pages/Contracts.tsx'), 'utf8');

test('pending offers route to the review wizard with a tracking fallback', () => {
  assert.ok(contracts.includes('`/review/${invoice.scanToken}`'), 'wizard route');
  assert.ok(contracts.includes('`/track/invoice/${invoice.id}`'), 'fallback route');
  const order = contracts.indexOf('invoice.scanToken\n          ? `/review/');
  assert.ok(order > -1, 'token decides, wizard first');
});

test('expired offers are filtered out of the pending section like Home', () => {
  assert.ok(contracts.includes(".filter((i) => i.status === 'due')"));
});

test('past rental rows are links to contract tracking', () => {
  const past = contracts.slice(contracts.indexOf('function PastRentalRow'));
  assert.ok(past.includes('`/track/contract/${item.id}`'));
  assert.ok(past.slice(0, 700).includes('<Link'), 'row is tappable');
});

test('merchant name passes through untouched and no raw id renders on the card', () => {
  // The from-label interpolates the real counterparty verbatim —
  // "تاجر ليند" style names are data, never rewritten client-side.
  assert.ok(contracts.includes("t('home.attention.fromMerchant', { merchant: invoice.counterparty })"));
  const row = contracts.slice(
    contracts.indexOf('function PendingInvoiceRow'),
    contracts.indexOf('function RentalBundleCard'));
  assert.ok(!/\{invoice\.id\}\s*</.test(row), 'uuid never rendered as text');
});

// ---------------------------------------------------------------------
// Contract tracking hero — structural guards (same suite: customer
// rental surfaces).
// ---------------------------------------------------------------------

const tracking = readFileSync(path.join(root, 'src/pages/ContractTracking.tsx'), 'utf8');

test('hero never headlines the public reference and renders it labeled instead', () => {
  assert.ok(tracking.includes('titleIsReference'), 'reference-as-title fallback is detected');
  assert.ok(tracking.includes("t('review.contract.reference')"), 'labeled رقم العقد row');
  assert.ok(!tracking.includes('text-[22px] leading-tight truncate text-ink-900'),
    'oversized 22px hero title removed');
  assert.ok(tracking.includes("t('track.contract.endsChip'"), 'end-date badge present');
  // The raw row UUID (contract.id) is never rendered as text.
  assert.ok(!/\{contract\.id\}\s*</.test(tracking));
});

test('documented-contract row: generated contract, tappable, friendly pending state', () => {
  // Tappable row opens the generated clauses (contractTemplate), with
  // the documented chip and the public reference — never a UUID.
  assert.ok(tracking.includes("t('track.contract.documentedContract')"));
  assert.ok(tracking.includes("t('track.contract.viewContract')"));
  assert.ok(tracking.includes("t('track.contract.documentedChip')"));
  assert.ok(tracking.includes("t('track.contract.contractPendingDoc')"), 'disabled state exists');
  assert.ok(tracking.includes('onClick={openFullContract}'));
  assert.ok(tracking.includes('contractTemplate ? ('), 'pending state when no template');
  const row = tracking.slice(tracking.indexOf('documentedContract'), tracking.indexOf('contractPendingDoc'));
  assert.ok(row.includes('contract.contractNumber'), 'public CN reference shown');
  assert.ok(!/\{contract\.id\}/.test(row), 'no raw UUID');
});

test('merchant docs section says documented contract, not upload-like copy', () => {
  const ar = JSON.parse(readFileSync(path.join(root, 'src/locales/ar.json'), 'utf8'));
  const en = JSON.parse(readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));
  assert.equal(ar.merchant.rental.docs.contract, 'عقد الإيجار الموثّق');
  assert.equal(ar.merchant.rental.docs.hint, 'عرض العقد');
  assert.equal(en.merchant.rental.docs.contract, 'Documented rental contract');
  assert.equal(en.merchant.rental.docs.hint, 'View contract');
  assert.equal(ar.track.contract.documentedChip, 'موثّق');
  assert.equal(ar.track.contract.contractPendingDoc, 'سيظهر العقد بعد اكتمال التوثيق');
});
