// =====================================================================
// Registration OTP — flag independence + structural guards.
// Run: npm run test:registration
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  resolveRegistrationOtpEnabled,
  resolveRenterOtpProvider,
} from './.otp-flags-bundle.mjs';

// ---------------------------------------------------------------------
// Independent switches — one flag never affects the other flow
// ---------------------------------------------------------------------
test('registration ON while renter OFF', () => {
  const env = { VITE_REGISTRATION_OTP_PROVIDER: 'sms-edge' };
  assert.equal(resolveRegistrationOtpEnabled(env), true);
  assert.equal(resolveRenterOtpProvider(env), 'rpc-inapp');
});

test('renter ON while registration OFF', () => {
  const env = { VITE_RENTER_OTP_PROVIDER: 'sms-edge' };
  assert.equal(resolveRegistrationOtpEnabled(env), false);
  assert.equal(resolveRenterOtpProvider(env), 'sms-edge');
});

test('both ON / both OFF', () => {
  const both = {
    VITE_RENTER_OTP_PROVIDER: 'sms-edge',
    VITE_REGISTRATION_OTP_PROVIDER: 'sms-edge',
  };
  assert.equal(resolveRegistrationOtpEnabled(both), true);
  assert.equal(resolveRenterOtpProvider(both), 'sms-edge');
  assert.equal(resolveRegistrationOtpEnabled({}), false);
  assert.equal(resolveRenterOtpProvider({}), 'rpc-inapp');
});

test('legacy VITE_OTP_PROVIDER keeps driving the renter flow only', () => {
  const env = { VITE_OTP_PROVIDER: 'sms-edge' };
  assert.equal(resolveRenterOtpProvider(env), 'sms-edge');
  assert.equal(resolveRegistrationOtpEnabled(env), false);
});

test('VITE_RENTER_OTP_PROVIDER overrides the legacy flag', () => {
  assert.equal(
    resolveRenterOtpProvider({
      VITE_OTP_PROVIDER: 'sms-edge',
      VITE_RENTER_OTP_PROVIDER: 'rpc-inapp',
    }),
    'rpc-inapp',
  );
});

test('unknown values fail safe (disabled / in-app)', () => {
  const env = {
    VITE_RENTER_OTP_PROVIDER: 'twilio-edge',
    VITE_REGISTRATION_OTP_PROVIDER: 'true',
  };
  assert.equal(resolveRenterOtpProvider(env), 'rpc-inapp');
  assert.equal(resolveRegistrationOtpEnabled(env), false);
});

// ---------------------------------------------------------------------
// Structural guards (source-level)
// ---------------------------------------------------------------------
const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260502125600_registration_otp.sql');
const sendFn = read('supabase/functions/registration-otp-send/index.ts');
const verifyFn = read('supabase/functions/registration-otp-verify/index.ts');
const renterOtp = read('src/lib/otp/index.ts');
const register = read('src/pages/auth/Register.tsx');
const session = read('src/pages/merchant/MerchantRentalSession.tsx');

test('migration pins the approved parameters', () => {
  assert.ok(migration.includes("interval '5 minutes'"), '5-minute expiry');
  assert.ok(migration.includes("interval '60 seconds'"), '60s resend cooldown');
  assert.ok(migration.includes('attempts >= 5'), '5-attempt cap');
  assert.ok(migration.includes('code_hash'), 'hash storage');
  assert.ok(!migration.includes('code_inapp'), 'no plaintext column in the registration table');
  assert.ok(migration.includes('grant execute on function public.registration_otp_start(text) to service_role'));
  assert.ok(migration.includes("current_user in ('anon', 'authenticated')"), 'service-role guard');
});

test('registration functions: secrets via Deno.env only, safe logging', () => {
  assert.ok(sendFn.includes("Deno.env.get('MSEGAT_API_KEY')"));
  assert.ok(!/MSEGAT_[A-Z_]+'\)\s*(\?\?|\|\|)\s*'[^']/.test(sendFn), 'no hardcoded fallbacks');
  for (const [name, src] of [['send', sendFn], ['verify', verifyFn]]) {
    for (const line of src.split('\n')) {
      if (!/console\.(log|error|warn|info)/.test(line)) continue;
      assert.ok(
        !/challenge\.code|\bcode\b.*p_code|apiKey|request\.body|buildOtpSmsMessage/.test(line),
        `unsafe log line in ${name}: ${line.trim()}`,
      );
    }
  }
});

test('verification never touches MSEGAT', () => {
  assert.ok(verifyFn.includes("rpc('registration_otp_check'"));
  assert.ok(!verifyFn.includes('msegat'), 'verify function must not import the provider');
});

test('renter/session OTP path is untouched by the registration flow', () => {
  assert.ok(renterOtp.includes("rpc('merchant_verify_renter_otp'"));
  assert.ok(!renterOtp.includes("from './registration'"), 'renter module never imports the registration module');
  assert.ok(!renterOtp.includes('sendRegistrationOtp'), 'renter module never calls registration OTP');
  assert.ok(!session.includes('RegistrationOtp'), 'merchant session never uses registration OTP');
});

test('signup gates on the flag and uses the registration service', () => {
  assert.ok(register.includes('isRegistrationOtpEnabled()'));
  assert.ok(register.includes('sendRegistrationOtp('));
  assert.ok(register.includes('verifyRegistrationOtp('));
  // Login must stay OTP-free.
  assert.ok(!read('src/pages/auth/Login.tsx').includes('RegistrationOtp'));
});
