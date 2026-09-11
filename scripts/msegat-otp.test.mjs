// =====================================================================
// MSEGAT OTP delivery — unit + guard tests.
// Run: npm run test:otp
// (bundles supabase/functions/_shared/{msegat,mobile}.ts via esbuild —
//  the adapter is pure, so it runs unchanged under Node.)
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  MSEGAT_DEFAULT_BASE_URL,
  buildMsegatSendRequest,
  buildOtpSmsMessage,
  maskMsegatNumber,
  parseMsegatResponse,
  toMsegatNumber,
} from './.msegat-bundle.mjs';
import { normalizeMobile } from './.mobile-bundle.mjs';

const CFG = {
  userName: 'PLACEHOLDER_USER',
  apiKey: 'PLACEHOLDER_KEY',
  userSender: 'PLACEHOLDER_SENDER',
};

// ---------------------------------------------------------------------
// Saudi mobile → MSEGAT number format
// ---------------------------------------------------------------------
test('canonical Saudi mobile converts to 9665xxxxxxxx', () => {
  assert.equal(toMsegatNumber('512345678'), '966512345678');
});

test('every accepted input format converges to the same MSEGAT number', () => {
  for (const input of ['0512345678', '+966512345678', '00966512345678', '٠٥١٢٣٤٥٦٧٨']) {
    const n = normalizeMobile(input);
    assert.ok(n, `normalizeMobile rejected ${input}`);
    assert.equal(toMsegatNumber(n.canonical), '966512345678', input);
  }
});

test('non-canonical values are refused (no accidental foreign sends)', () => {
  for (const bad of ['412345678', '51234567', '5123456789', '9665123456', '', 'abc']) {
    assert.equal(toMsegatNumber(bad), null, bad);
  }
});

// ---------------------------------------------------------------------
// Message + payload building
// ---------------------------------------------------------------------
test('SMS body is the exact provider-safe template', () => {
  assert.equal(buildOtpSmsMessage('123456'), 'رمز التحقق: 123456');
});

test('send request carries the documented MSEGAT fields', () => {
  const req = buildMsegatSendRequest(CFG, '966512345678', buildOtpSmsMessage('123456'));
  assert.equal(req.url, `${MSEGAT_DEFAULT_BASE_URL}/gw/sendsms.php`);
  assert.deepEqual(req.body, {
    userName: 'PLACEHOLDER_USER',
    apiKey: 'PLACEHOLDER_KEY',
    userSender: 'PLACEHOLDER_SENDER',
    numbers: '966512345678',
    msg: 'رمز التحقق: 123456',
    msgEncoding: 'UTF8',
  });
});

test('MSEGAT_BASE_URL override is honored (trailing slash stripped)', () => {
  const req = buildMsegatSendRequest(
    { ...CFG, baseUrl: 'https://staging.example/' }, '966512345678', 'x');
  assert.equal(req.url, 'https://staging.example/gw/sendsms.php');
});

// ---------------------------------------------------------------------
// Provider response / error mapping
// ---------------------------------------------------------------------
test('success codes: "1" and "M0000" (any casing, number or string)', () => {
  assert.deepEqual(parseMsegatResponse({ code: '1' }), { ok: true });
  assert.deepEqual(parseMsegatResponse({ code: 1 }), { ok: true });
  assert.deepEqual(parseMsegatResponse({ code: 'M0000' }), { ok: true });
  assert.deepEqual(parseMsegatResponse({ code: 'm0000' }), { ok: true });
});

test('non-success surfaces the numeric provider code only', () => {
  assert.deepEqual(parseMsegatResponse({ code: '1010' }), { ok: false, providerCode: '1010' });
  assert.deepEqual(parseMsegatResponse('garbage'), { ok: false, providerCode: 'garbage' });
  assert.deepEqual(parseMsegatResponse(null), { ok: false, providerCode: 'no_code' });
});

test('log mask never reveals the full recipient', () => {
  assert.equal(maskMsegatNumber('966512345678'), '9665•••••78');
  assert.ok(!maskMsegatNumber('966512345678').includes('12345'));
});

// ---------------------------------------------------------------------
// Structural security guards (source-level)
// ---------------------------------------------------------------------
const root = path.resolve(import.meta.dirname, '..');
const clientOtp = readFileSync(path.join(root, 'src/lib/otp/index.ts'), 'utf8');
const edgeFn = readFileSync(path.join(root, 'supabase/functions/otp-send/index.ts'), 'utf8');

test('verifyOtp always uses the DB RPC — never a provider verify', () => {
  assert.ok(clientOtp.includes("rpc('merchant_verify_renter_otp'"));
  assert.ok(!clientOtp.includes("invoke<OtpVerifyResult>"));
  assert.ok(!clientOtp.includes("'otp-verify'"));
  // verifyOtp body must not branch on the provider.
  const verifyBody = clientOtp.slice(clientOtp.indexOf('export async function verifyOtp'));
  assert.ok(!verifyBody.slice(0, 700).includes('sms-edge'));
});

test('no MSEGAT credential can reach the frontend bundle', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (statSync(fp).isDirectory()) walk(fp);
      else if (/\.(ts|tsx)$/.test(f) && readFileSync(fp, 'utf8').includes('MSEGAT_')) {
        offenders.push(fp);
      }
    }
  };
  walk(path.join(root, 'src'));
  assert.deepEqual(offenders, [], 'MSEGAT secret names must never appear under src/');
  assert.ok(!clientOtp.includes('VITE_MSEGAT'));
});

test('in-app renter OTP: push nudge is code-free, SMS path opts out', () => {
  const migration = readFileSync(
    path.join(root, 'supabase/migrations/20260502125700_renter_otp_inapp_push.sql'), 'utf8');
  // The notification insert block must never reference the code.
  const notifyBlock = migration.slice(
    migration.indexOf("if p_delivery = 'inapp' then"),
    migration.indexOf('end if;', migration.indexOf("if p_delivery = 'inapp' then")),
  );
  assert.ok(notifyBlock.length > 0, 'in-app notify block exists');
  assert.ok(!notifyBlock.includes('v_code'), 'push notification never carries the code');
  assert.ok(migration.includes("'renter_otp_ready'"));
  assert.ok(migration.includes("p_delivery text default 'inapp'"), 'client RPC default stays in-app');
  // The SMS edge function suppresses the in-app nudge.
  assert.ok(edgeFn.includes("p_delivery: 'sms'"));
  // The push job body copy is the approved code-free text.
  assert.ok(migration.includes('وصلك رمز تحقق لإكمال إنشاء عقد إيجار'));
  // The dispatcher only ever forwards job.title/job.body — no code path.
  const dispatch = readFileSync(
    path.join(root, 'supabase/functions/push-dispatch/index.ts'), 'utf8');
  assert.ok(dispatch.includes('job.body'), 'dispatcher forwards the optional body');
});

test('edge function reads secrets only via Deno.env and never logs code/key/body', () => {
  assert.ok(edgeFn.includes("Deno.env.get('MSEGAT_API_KEY')"));
  // No hardcoded credential fallbacks next to the secret reads.
  assert.ok(!/MSEGAT_[A-Z_]+'\)\s*(\?\?|\|\|)\s*'[^']/.test(edgeFn));
  // No console call may reference the plaintext code, the api key, or
  // the composed request/message.
  for (const line of edgeFn.split('\n')) {
    if (!/console\.(log|error|warn|info)/.test(line)) continue;
    assert.ok(!/dispatch\.code|apiKey|request\.body|\bmsg\b|buildOtpSmsMessage/.test(line),
      `unsafe log line: ${line.trim()}`);
  }
});
