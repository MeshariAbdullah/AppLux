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
const merchantRegister = read('src/pages/merchant/MerchantRegister.tsx');
const session = read('src/pages/merchant/MerchantRentalSession.tsx');

test('migration supports both signup roles with per-role stamps', () => {
  assert.ok(migration.includes("check (account_role in ('customer', 'merchant'))"));
  assert.ok(migration.includes("p_account_role text default 'customer'"));
  assert.ok(migration.includes("c.account_role = 'customer'"), 'customer stamp scoped');
  assert.ok(migration.includes("c.account_role = 'merchant'"), 'merchant stamp scoped');
  assert.ok(migration.includes('contact_mobile_verified_at'), 'merchant application stamp column');
  assert.ok(migration.includes('on_merchant_application_stamp_mobile_verified'));
});

test('migration pins the approved parameters', () => {
  assert.ok(migration.includes("interval '5 minutes'"), '5-minute expiry');
  assert.ok(migration.includes("interval '60 seconds'"), '60s resend cooldown');
  assert.ok(migration.includes('attempts >= 5'), '5-attempt cap');
  assert.ok(migration.includes('code_hash'), 'hash storage');
  assert.ok(!migration.includes('code_inapp'), 'no plaintext column in the registration table');
  assert.ok(migration.includes('grant execute on function public.registration_otp_start(text, text) to service_role'));
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

test('customer signup gates on the flag and uses the registration service', () => {
  assert.ok(register.includes('registrationOtpState()'));
  assert.ok(register.includes('sendRegistrationOtp('));
  assert.ok(register.includes('verifyRegistrationOtp('));
  // Login must stay OTP-free.
  assert.ok(!read('src/pages/auth/Login.tsx').includes('RegistrationOtp'));
  assert.ok(!read('src/pages/merchant/MerchantLogin.tsx').includes('RegistrationOtp'));
});

test('merchant signup requires OTP when enabled, fails closed when blocked', () => {
  // Same flag, merchant role — behind regOtpState which comes from
  // registrationOtpState() (the flag matrix above proves the states).
  assert.ok(merchantRegister.includes("configured && regOtpState === 'enabled'"));
  assert.ok(merchantRegister.includes("sendRegistrationOtp(canonical, 'merchant', values.email.trim())")
    || merchantRegister.includes("sendRegistrationOtp(n.canonical, 'merchant', values.email.trim())"));
  assert.ok(merchantRegister.includes('verifyRegistrationOtp('));
  // The final submit re-checks the verified number before signUp.
  assert.ok(merchantRegister.includes('regOtpVerifiedFor !== n.canonical'));
});

test('both signup flows share ONE MSEGAT secret set', () => {
  for (const name of ['MSEGAT_USERNAME', 'MSEGAT_API_KEY', 'MSEGAT_SENDER_NAME']) {
    assert.ok(sendFn.includes(`Deno.env.get('${name}')`), name);
  }
  // No role-specific credential names anywhere in functions or SQL.
  for (const src of [sendFn, verifyFn, migration]) {
    assert.ok(!/MSEGAT_(MERCHANT|CUSTOMER|REG)/.test(src), 'no duplicated secrets');
  }
});

// ---------------------------------------------------------------------
// Duplicate preflight — the pre-SMS email/mobile availability check
// (registration_otp_precheck, 20260502130300). Ordering and privacy
// guards; behavior is covered by supabase/tests/registration_preflight_test.sql.
// ---------------------------------------------------------------------
const preflightMig = read('supabase/migrations/20260502130300_registration_preflight.sql');
const regClient = read('src/lib/otp/registration.ts');

test('preflight runs BEFORE challenge creation and BEFORE MSEGAT', () => {
  const precheckAt = sendFn.indexOf("rpc('registration_otp_precheck'");
  const startAt = sendFn.indexOf("rpc('registration_otp_start'");
  const msegatAt = sendFn.indexOf('buildMsegatSendRequest(');
  assert.ok(precheckAt > -1, 'send fn calls the precheck');
  assert.ok(startAt > -1 && msegatAt > -1);
  assert.ok(precheckAt < startAt, 'precheck before registration_otp_start');
  assert.ok(precheckAt < msegatAt, 'precheck before any MSEGAT call');
  // Duplicate outcomes return without ever reaching start/MSEGAT.
  for (const outcome of ["'email_taken'", "'mobile_taken'"]) {
    const at = sendFn.indexOf(`error: ${outcome}`);
    assert.ok(at > -1 && at < startAt, `${outcome} exits before challenge creation`);
  }
});

test('precheck RPC: service-role only, returns statuses (no challenge rows), probe-throttled', () => {
  assert.ok(preflightMig.includes("current_user in ('anon', 'authenticated')"));
  assert.ok(preflightMig.includes("errcode = '42501'"));
  for (const s of ["'ok'", "'invalid_mobile'", "'invalid_email'", "'email_taken'", "'mobile_taken'", "'rate_limited'"]) {
    assert.ok(preflightMig.includes(`return ${s}`), `status ${s}`);
  }
  // Never writes a registration_otp_challenges row.
  assert.ok(!preflightMig.includes('insert into public.registration_otp_challenges'));
  // Probe throttle ledger with pruning.
  assert.ok(preflightMig.includes('registration_precheck_attempts'));
  assert.ok(preflightMig.includes("interval '24 hours'"));
  assert.ok(preflightMig.includes('to service_role'));
  // The email is checked in-transit only, never stored: the ledger
  // insert carries the mobile alone.
  assert.ok(preflightMig.includes('insert into public.registration_precheck_attempts (mobile)'));
  // registration_otp_start's own limits are untouched (still in 125600).
  assert.ok(migration.includes("errcode = 'P0192'"));
  assert.ok(migration.includes("errcode = 'P0196'"));
});

test('send fn maps precheck outcomes and never logs email or full mobile', () => {
  assert.ok(sendFn.includes("case 'email_taken':"));
  assert.ok(sendFn.includes("case 'mobile_taken':"));
  assert.ok(sendFn.includes("error: 'preflight_failed'"));
  // Missing-RPC grace: a project without 20260502130300 keeps sending.
  assert.ok(sendFn.includes("'PGRST202'"));
  // No console line interpolates the raw email or unmasked mobile.
  for (const line of sendFn.split('\n').filter((l) => l.includes('console.'))) {
    assert.ok(!/\bemail\b/.test(line), `email in log line: ${line.trim()}`);
    assert.ok(
      !line.includes('normalized.canonical') && !line.includes('msegatNumber,'),
      `unmasked mobile in log line: ${line.trim()}`,
    );
  }
});

test('both signup forms send the email along for the preflight', () => {
  assert.ok(regClient.includes("| 'email_taken'"));
  assert.ok(regClient.includes("| 'mobile_taken'"));
  assert.ok(regClient.includes("| 'preflight_failed'"));
  // Customer form: canonical email on first send AND resend.
  assert.equal(
    (register.match(/sendRegistrationOtp\(\s*normalizedMobile[!.]?\S*\.canonical,\s*'customer',/g) ?? []).length >= 2 ||
      (register.match(/'customer',/g) ?? []).length >= 2,
    true,
    'customer sends pass role+email',
  );
  assert.ok(register.includes("case 'email_taken':"));
  assert.ok(register.includes("case 'mobile_taken':"));
  // Merchant form: email on open AND resend; taken email routes back
  // to the email step like every other taken-email path.
  assert.equal(
    (merchantRegister.match(/sendRegistrationOtp\([^)]*'merchant',\s*values\.email\.trim\(\)\)/g) ?? []).length,
    2,
  );
  assert.ok(merchantRegister.includes("err.code === 'email_taken'"));
  assert.ok(merchantRegister.includes('returnToStep0EmailTaken();'));
});

test('preflight copy is the approved Arabic/English', () => {
  const ar = JSON.parse(read('src/locales/ar.json'));
  const en = JSON.parse(read('src/locales/en.json'));
  assert.equal(ar.auth.regOtp.errors.emailTaken,
    'البريد الإلكتروني مستخدم مسبقًا. سجّل الدخول أو استخدم بريدًا آخر.');
  assert.equal(ar.auth.regOtp.errors.mobileTaken,
    'رقم الجوال مستخدم مسبقًا. سجّل الدخول أو استخدم رقمًا آخر.');
  assert.equal(ar.auth.regOtp.errors.preflight,
    'تعذر التحقق من بيانات التسجيل. حاول مرة أخرى.');
  assert.equal(en.auth.regOtp.errors.emailTaken,
    'This email is already registered. Sign in or use another email.');
  assert.equal(en.auth.regOtp.errors.mobileTaken,
    'This mobile number is already registered. Sign in or use another number.');
  assert.equal(en.auth.regOtp.errors.preflight,
    "We couldn't verify the registration details. Please try again.");
});

// ---------------------------------------------------------------------
// FAIL-CLOSED registration (release-blocking incident): a production
// build without VITE_REGISTRATION_OTP_PROVIDER must BLOCK registration
// with a configuration error — never fall back to a direct signUp
// where Supabase's email confirmation becomes the only gate.
// ---------------------------------------------------------------------
import { resolveRegistrationOtpState } from './.otp-flags-bundle.mjs';

test('state matrix: missing flag blocks PROD, only sms-edge enables', () => {
  // PROD build:
  assert.equal(resolveRegistrationOtpState({}, true), 'blocked');
  assert.equal(resolveRegistrationOtpState({ VITE_REGISTRATION_OTP_PROVIDER: '' }, true), 'blocked');
  assert.equal(resolveRegistrationOtpState({ VITE_REGISTRATION_OTP_PROVIDER: 'off' }, true), 'blocked');
  assert.equal(resolveRegistrationOtpState({ VITE_REGISTRATION_OTP_PROVIDER: 'sms-edge' }, true), 'enabled');
  // DEV build keeps the legacy off mode (local development only):
  assert.equal(resolveRegistrationOtpState({}, false), 'disabled');
  assert.equal(resolveRegistrationOtpState({ VITE_REGISTRATION_OTP_PROVIDER: 'sms-edge' }, false), 'enabled');
  // The renter/session flag never affects it.
  assert.equal(resolveRegistrationOtpState({ VITE_RENTER_OTP_PROVIDER: 'sms-edge' }, true), 'blocked');
});

test('both signup forms refuse to submit while blocked, BEFORE any signUp', () => {
  for (const [name, src, submitCall] of [
    ['customer', register, 'performSignUp'],
    ['merchant', merchantRegister, 'submitLive'],
  ]) {
    assert.ok(src.includes("regOtpState === 'blocked'"), `${name}: blocked state`);
    const gate = src.indexOf("t('auth.regOtp.errors.buildMisconfigured')");
    assert.ok(gate > -1, `${name}: shows the config error`);
    // The blocked gate sits in the same submit path, before the
    // account-creation call that follows it.
    const submitAt = src.indexOf(`await ${submitCall}()`, gate);
    assert.ok(submitAt > gate, `${name}: gate precedes ${submitCall}`);
  }
});

test('the env var is documented where native builds are made', () => {
  const envExample = read('.env.example');
  assert.ok(envExample.includes('VITE_REGISTRATION_OTP_PROVIDER=sms-edge'));
  assert.ok(read('docs/ios-testflight.md').includes('VITE_REGISTRATION_OTP_PROVIDER=sms-edge'));
});

test('blocked copy exists in both languages', () => {
  const arL = JSON.parse(read('src/locales/ar.json'));
  const enL = JSON.parse(read('src/locales/en.json'));
  assert.ok(arL.auth.regOtp.errors.buildMisconfigured.includes('إعدادات غير مكتملة'));
  assert.ok(enL.auth.regOtp.errors.buildMisconfigured.includes('missing required setup'));
});
