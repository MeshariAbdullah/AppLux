// =====================================================================
// i18n coverage guards — no raw translation keys or English fallbacks
// on dispute/damage screens (real-device report: a literal
// "merchant.disputes.events.customer_response_deadline_set" and an
// English "Damage report for CN-…" in the Arabic UI).
// Run: npm run test:i18n
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { caseDescriptionDisplay, disputeEventLabel } from './.dispute-event-label-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const ar = JSON.parse(read('src/locales/ar.json'));
const en = JSON.parse(read('src/locales/en.json'));

// The COMPLETE server vocabularies (20260502130000 = union of every
// list the product ever wrote). Kept literal here so a future enum
// addition fails this test until its copy exists.
const EVENT_TYPES = [
  'claim_opened', 'customer_response_deadline_set', 'customer_accepted',
  'customer_objected', 'evidence_added', 'direct_proposal_submitted',
  'direct_proposal_accepted', 'direct_proposal_rejected',
  'direct_round_exhausted', 'customer_no_response_recorded',
  'moved_to_lend_mediation', 'lend_proposal_submitted',
  'merchant_accepted_lend_proposal', 'customer_accepted_lend_proposal',
  'lend_proposal_rejected', 'dispute_resolved', 'dispute_unresolved',
  'case_dismissed_by_lend',
];
const NOTIFICATION_TYPES = [
  'offer_issued', 'renter_otp_ready', 'dispute_claim_submitted',
  'dispute_customer_accepted', 'dispute_customer_objected',
  'dispute_proposal_received', 'dispute_proposal_accepted',
  'dispute_proposal_rejected', 'dispute_customer_no_response',
  'dispute_moved_to_lend', 'dispute_lend_proposal', 'dispute_resolved',
  'dispute_unresolved', 'dispute_dismissed',
];
const OUTCOMES = ['claim_accepted', 'direct_settlement', 'lend_settlement', 'unresolved', 'dismissed'];
const PHASES = ['awaiting_customer', 'direct_settlement', 'lend_mediation', 'resolved'];

const arabic = (s) => /[؀-ۿ]/.test(s);

test('the migration vocabulary matches this test and restores dismissal', () => {
  const mig = read('supabase/migrations/20260502130000_restore_dismissal_vocabulary.sql');
  for (const t2 of EVENT_TYPES) assert.ok(mig.includes(`'${t2}'`), t2);
  for (const t2 of NOTIFICATION_TYPES) assert.ok(mig.includes(`'${t2}'`), t2);
});

test('every dispute event type has Arabic AND English copy', () => {
  for (const type of EVENT_TYPES) {
    const a = ar.merchant.disputes.events[type];
    const e = en.merchant.disputes.events[type];
    assert.ok(a && arabic(a), `ar missing/not-arabic: ${type}`);
    assert.ok(e && !arabic(e), `en missing: ${type}`);
  }
  // The specifically reported key.
  assert.ok(ar.merchant.disputes.events.customer_response_deadline_set.includes('مهلة'));
  assert.ok(/customer response (deadline|window) set/i.test(
    en.merchant.disputes.events.customer_response_deadline_set));
});

test('unknown-event fallback exists and the helper uses it', () => {
  assert.equal(ar.merchant.disputes.events.unknown, 'تحديث على الحالة');
  assert.equal(en.merchant.disputes.events.unknown, 'Case update');
  // Fake t with the real miss-behavior (returns the key).
  const dict = { 'merchant.disputes.events.claim_opened': 'فُتحت المطالبة',
                 'merchant.disputes.events.unknown': 'تحديث على الحالة' };
  const t = (k) => dict[k] ?? k;
  assert.equal(disputeEventLabel(t, 'claim_opened'), 'فُتحت المطالبة');
  assert.equal(disputeEventLabel(t, 'some_future_event'), 'تحديث على الحالة');
  assert.ok(!disputeEventLabel(t, 'some_future_event').includes('.'), 'never a raw key');
});

test('timelines render through the guarded helper, never raw key templates', () => {
  for (const p of ['src/pages/merchant/MerchantDamageDetails.tsx',
                   'src/pages/admin/AdminCaseDetails.tsx']) {
    const src = read(p);
    assert.ok(src.includes('disputeEventLabel(t, e.event_type)'), p);
    assert.ok(!src.includes('merchant.disputes.events.${'), `${p}: unguarded key template`);
  }
});

test('damage default description is localized at write AND legacy rows map on display', () => {
  assert.equal(ar.merchant.damage.new.defaultDescription, 'بلاغ ضرر للعقد {contract}');
  assert.equal(en.merchant.damage.new.defaultDescription, 'Damage report for {contract}');
  const writer = read('src/pages/merchant/MerchantDamageNew.tsx');
  assert.ok(!writer.includes('`Damage report for'), 'hardcoded English default removed');
  assert.ok(writer.includes("t('merchant.damage.new.defaultDescription'"));
  // Legacy stored rows: helper localizes, keeps the contract ref, and
  // leaves merchant-written notes untouched.
  const t = (k, vars) => (k === 'merchant.damage.new.defaultDescription'
    ? `بلاغ ضرر للعقد ${vars.contract}` : k);
  assert.equal(caseDescriptionDisplay(t, 'Damage report for CN-2026-100043'),
    'بلاغ ضرر للعقد CN-2026-100043');
  assert.equal(caseDescriptionDisplay(t, 'خدش في الكم الأيسر'), 'خدش في الكم الأيسر');
  // All four description renders (3 screens + dispute PDF) go through it.
  for (const p of ['src/pages/DisputeDetails.tsx',
                   'src/pages/merchant/MerchantDamageDetails.tsx',
                   'src/pages/admin/AdminCaseDetails.tsx',
                   'src/lib/pdf/disputeFilePdf.ts']) {
    assert.ok(read(p).includes('caseDescriptionDisplay(t, kase.description)'), p);
  }
});

test('outcomes, phases, statuses and notification copy are fully covered in both languages', () => {
  for (const o of OUTCOMES) {
    assert.ok(arabic(ar.merchant.disputes.outcome[o]), `outcome ar: ${o}`);
    assert.ok(en.merchant.disputes.outcome[o], `outcome en: ${o}`);
  }
  for (const p of PHASES) {
    assert.ok(arabic(ar.disputes.phase[p]), `phase ar: ${p}`);
    assert.ok(arabic(ar.merchant.disputes.phase[p]), `merchant phase ar: ${p}`);
  }
  for (const s of ['pending', 'accepted', 'rejected']) {
    assert.ok(arabic(ar.disputes.settlement.status[s]), `status ar: ${s}`);
  }
  for (const n of NOTIFICATION_TYPES) {
    for (const [lang, dict] of [['ar', ar], ['en', en]]) {
      const entry = dict.notifications[n === 'offer_issued' ? 'offerIssued' : n];
      assert.ok(entry?.title && entry?.body, `${lang} notification copy: ${n}`);
    }
  }
});

test('ar/en dispute locale trees stay structurally identical', () => {
  const keys = (o, p = '') =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`]);
  for (const subtree of ['disputes', 'disputeFile']) {
    assert.deepEqual(keys(ar[subtree]).sort(), keys(en[subtree]).sort(), subtree);
  }
  assert.deepEqual(keys(ar.merchant.disputes).sort(), keys(en.merchant.disputes).sort());
  assert.deepEqual(keys(ar.merchant.damage).sort(), keys(en.merchant.damage).sort());
});
