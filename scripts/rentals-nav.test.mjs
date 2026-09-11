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
