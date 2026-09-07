// Node unit tests for src/lib/disputeDeadline.ts — run via
// `npm run test:disputes` (esbuild bundle + node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerDeadlineState } from './.dispute-deadline-bundle.mjs';

const now = Date.parse('2026-08-30T12:00:00Z');
const inOneHour = new Date(now + 3600_000).toISOString();
const oneHourAgo = new Date(now - 3600_000).toISOString();

test('awaiting + future deadline → active', () => {
  assert.equal(
    customerDeadlineState(
      { dispute_phase: 'awaiting_customer', customer_response_deadline: inOneHour },
      now,
    ),
    'active',
  );
});

test('awaiting + passed deadline → expired (pre-sweep)', () => {
  assert.equal(
    customerDeadlineState(
      { dispute_phase: 'awaiting_customer', customer_response_deadline: oneHourAgo },
      now,
    ),
    'expired',
  );
});

test('recorded non-response wins regardless of phase', () => {
  assert.equal(
    customerDeadlineState(
      {
        dispute_phase: 'lend_mediation',
        customer_response_deadline: oneHourAgo,
        customer_no_response_recorded_at: oneHourAgo,
      },
      now,
    ),
    'recorded',
  );
});

test('legacy case without deadline fields → none (renders as before)', () => {
  assert.equal(
    customerDeadlineState({ dispute_phase: 'awaiting_customer' }, now),
    'none',
  );
  assert.equal(
    customerDeadlineState(
      { dispute_phase: 'awaiting_customer', customer_response_deadline: null },
      now,
    ),
    'none',
  );
});

test('merchant-pending phases never read as customer non-response', () => {
  for (const phase of ['direct_settlement', 'lend_mediation', 'resolved']) {
    assert.equal(
      customerDeadlineState(
        { dispute_phase: phase, customer_response_deadline: oneHourAgo },
        now,
      ),
      'none',
    );
  }
});

test('malformed deadline degrades to none, never a crash', () => {
  assert.equal(
    customerDeadlineState(
      { dispute_phase: 'awaiting_customer', customer_response_deadline: 'garbage' },
      now,
    ),
    'none',
  );
});
