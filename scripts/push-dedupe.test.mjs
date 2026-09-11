// =====================================================================
// Push pipeline idempotency — structural guards against duplicate
// deliveries (the real-device 3× duplicate report).
// Run: npm run test:push
//
// These are source-level invariants over the migrations + dispatcher +
// client registration: every layer that once allowed a duplicate now
// carries an explicit guard, and the layers that were already safe
// must stay that way.
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const mig124800 = read('supabase/migrations/20260502124800_push_notifications.sql');
const mig125400 = read('supabase/migrations/20260502125400_customer_response_deadline.sql');
const mig125700 = read('supabase/migrations/20260502125700_renter_otp_inapp_push.sql');
const mig125800 = read('supabase/migrations/20260502125800_push_dedupe_and_claiming.sql');
const dispatcher = read('supabase/functions/push-dispatch/index.ts');
const registerPush = read('src/lib/push/registerPush.ts');

// ---------------------------------------------------------------------
// Layer 1 — notifications: one row per logical event & recipient
// ---------------------------------------------------------------------

test('every dispute type is covered by exactly one uniqueness rule', () => {
  // Strictly-once types (user, type, case) — 125400's index (the live
  // definition once applied).
  const onceIdx = mig125400.slice(
    mig125400.indexOf('create unique index notifications_dispute_event_once'),
    mig125400.indexOf(';', mig125400.indexOf('create unique index notifications_dispute_event_once')));
  for (const t of ['dispute_claim_submitted', 'dispute_customer_accepted',
                   'dispute_customer_objected', 'dispute_customer_no_response',
                   'dispute_moved_to_lend', 'dispute_lend_proposal',
                   'dispute_resolved', 'dispute_unresolved']) {
    assert.ok(onceIdx.includes(`'${t}'`), `${t} missing from once-index`);
  }
  // Repeatable-per-proposal types — 125800's explicit idempotency key
  // (user, type, case, proposal_id from metadata).
  const propStart = mig125800.indexOf(
    'create unique index if not exists notifications_dispute_proposal_once');
  const propIdx = mig125800.slice(propStart, mig125800.indexOf(';', propStart));
  for (const t of ['dispute_proposal_received', 'dispute_proposal_accepted',
                   'dispute_proposal_rejected']) {
    assert.ok(propIdx.includes(`'${t}'`), `${t} missing from proposal once-index`);
  }
  assert.ok(propIdx.includes("metadata->>'proposal_id'"), 'proposal key is explicit');
});

test('proposal-index cleanup keeps the earliest duplicate, never all rows', () => {
  const del = mig125800.slice(
    mig125800.indexOf('delete from public.notifications'),
    mig125800.indexOf('create unique index if not exists notifications_dispute_proposal_once'));
  assert.ok(del.includes('keep.created_at < n.created_at'), 'earliest row survives');
  assert.ok(del.includes("metadata->>'proposal_id' is not null"), 'scoped to keyed rows only');
});

test('renter_otp_ready: exactly one notification per OTP challenge', () => {
  const inapp = mig125700.slice(
    mig125700.indexOf("if p_delivery = 'inapp' then"),
    mig125700.indexOf('end if;', mig125700.indexOf("if p_delivery = 'inapp' then")));
  assert.equal((inapp.match(/insert into public\.notifications/g) ?? []).length, 1);
  assert.ok(mig125700.includes("interval '15 seconds'"), 'resend throttle bounds the rate');
});

// ---------------------------------------------------------------------
// Layer 2 — push_jobs: at most one job per notification
// ---------------------------------------------------------------------

test('push_jobs stays unique per notification and the trigger is idempotent', () => {
  assert.ok(mig124800.includes('notification_id uuid not null unique'));
  assert.ok(mig125700.includes('on conflict (notification_id) do nothing'),
    'live trigger version absorbs re-fires');
});

// ---------------------------------------------------------------------
// Layer 3 — dispatcher: claim before send, guarded finish
// ---------------------------------------------------------------------

test('jobs are claimed atomically — concurrent runs cannot double-send', () => {
  assert.ok(mig125800.includes('for update skip locked'), 'claim uses SKIP LOCKED');
  assert.ok(mig125800.includes("set status = 'processing'"), 'claim moves rows out of pending');
  assert.ok(/attempts = pj\.attempts \+ 1/.test(mig125800),
    'attempt consumed at claim (crash still burns an attempt)');
  assert.ok(dispatcher.includes('claim_push_jobs'), 'dispatcher claims via the RPC');
  assert.ok(!/from\("push_jobs"\)\.select/.test(dispatcher),
    'dispatcher never SELECTs the outbox directly anymore');
});

test('a sent job can never be re-sent', () => {
  // finish transitions only rows this run holds…
  assert.ok(mig125800.includes("and status = 'processing'"),
    'finish_push_job guarded by processing status');
  // …and the stale-requeue only touches processing rows, never sent ones.
  const requeue = mig125800.slice(
    mig125800.indexOf('update push_jobs'),
    mig125800.indexOf('return query'));
  assert.ok(requeue.includes("where status = 'processing'"));
  assert.ok(!requeue.includes("'sent'") || !/status\s*=\s*'sent'/.test(requeue),
    'requeue never resets sent jobs');
  assert.ok(dispatcher.includes('finish_push_job'), 'dispatcher reports through the guarded RPC');
  assert.ok(dispatcher.includes('finishErr'), 'finish result is checked, not fire-and-forget');
});

test('claim/finish RPCs are service-only', () => {
  for (const fn of ['claim_push_jobs(integer)', 'finish_push_job(uuid, boolean, text)']) {
    assert.ok(mig125800.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn);
    assert.ok(mig125800.includes(`grant execute on function public.${fn} to service_role`), fn);
  }
  assert.equal((mig125800.match(/raise exception '[a-z_]+ is service-only'/g) ?? []).length, 2);
});

// ---------------------------------------------------------------------
// Layer 4 — device tokens: one delivery per physical device
// ---------------------------------------------------------------------

test('token rows stay globally unique; same-device re-registration revokes leftovers', () => {
  assert.ok(mig124800.includes('token       text not null unique'));
  const revoke = mig125800.slice(
    mig125800.indexOf('if v_device is not null then'),
    mig125800.indexOf('end if;', mig125800.indexOf('if v_device is not null then')));
  assert.ok(revoke.includes('device_id = v_device'), 'scoped to the SAME device…');
  assert.ok(revoke.includes('user_id = auth.uid()'), '…of the SAME user');
  assert.ok(revoke.includes("token <> trim(p_token)"), 'the fresh token itself survives');
  // Legacy NULL-device rows must never be mass-revoked.
  assert.ok(!revoke.includes('device_id is null'));
});

test('dispatcher never sends twice to one token value per job', () => {
  assert.ok(dispatcher.includes('new Set<string>()'));
  assert.ok(dispatcher.includes('seen.has(t.token)'));
});

test('client sends a stable install id, with a legacy fallback until the migration lands', () => {
  assert.ok(registerPush.includes('p_device_id'));
  assert.ok(registerPush.includes("localStorage.getItem(INSTALL_ID_KEY)"));
  const fallback = registerPush.slice(registerPush.indexOf('Legacy fallback'));
  assert.ok(fallback.includes("{ p_token: t.value, p_platform: platform }"),
    'two-arg retry keeps registration alive pre-migration');
});

// ---------------------------------------------------------------------
// Non-regression: the OTP flows must be untouched by 125800
// ---------------------------------------------------------------------

test('125800 does not touch either OTP flow or notification inserts', () => {
  for (const banned of ['registration_otp', 'renter_otp_challenges',
                        'merchant_start_renter_otp', 'msegat',
                        'insert into public.notifications (']) {
    assert.ok(!mig125800.toLowerCase().includes(banned.toLowerCase()),
      `125800 must not touch: ${banned}`);
  }
});

test('push payloads still never carry a code and still forward the optional body', () => {
  assert.ok(!/dispatch\.code|code_inapp|v_code/.test(dispatcher));
  assert.ok(dispatcher.includes('job.body'), 'renter_otp_ready body still delivered');
  assert.ok(dispatcher.includes('"apns-collapse-id": job.notification_id'),
    'same-notification re-delivery still collapses on-device as a last resort');
});
