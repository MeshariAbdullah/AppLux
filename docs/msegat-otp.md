# MSEGAT SMS delivery for the renter OTP

MSEGAT is a **send-only delivery channel** for the merchant-session
customer-presence OTP. The database remains the single OTP authority:
code generation, sha256 verification (`merchant_verify_renter_otp`),
10-minute expiry, 5-attempt cap, throttling, and the P0195
offer-issuance gate are unchanged. MSEGAT's hosted OTP
(sendOTPCode/verifyOTPCode) endpoints are **deliberately not used** —
they would move verification outside the DB and bypass the issuance
gate.

## Components

| Piece | Where |
|---|---|
| One-time dispatch RPC (service-role only) | `supabase/migrations/20260502125500_otp_sms_dispatch.sql` |
| Edge Function (send-only) | `supabase/functions/otp-send` |
| Provider adapter (endpoint + field names, isolated) | `supabase/functions/_shared/msegat.ts` |
| Client provider seam | `src/lib/otp/index.ts` (`VITE_OTP_PROVIDER`) |
| SMS body | `رمز التحقق: {code}` (provider-safe template wording) |

## Required Supabase secrets (Edge Function secrets — never in the repo, never `VITE_*`)

```
supabase secrets set MSEGAT_USERNAME=...      # MSEGAT account username
supabase secrets set MSEGAT_API_KEY=...       # MSEGAT API key
supabase secrets set MSEGAT_SENDER_NAME=...   # approved sender name
# optional — defaults to https://www.msegat.com
supabase secrets set MSEGAT_BASE_URL=...
```

Or Dashboard → Project → **Edge Functions → Secrets**. `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

## Deploy / enable (manual — never automatic)

1. Apply `20260502125400` (if not yet) then
   `20260502125500_otp_sms_dispatch.sql` in the SQL Editor.
2. Set the secrets above.
3. Deploy the function: `supabase functions deploy otp-send`
   (or Dashboard → Edge Functions → otp-send → Deploy). JWT
   verification stays ON (default).
4. Frontend (Vercel → Environment Variables): `VITE_OTP_PROVIDER=sms-edge`,
   then redeploy with a fresh build. **Without this variable the app
   stays on the current in-app delivery (`rpc-inapp`)** — safe default.
5. In `sms-edge` builds the customer-side in-app code card hides
   itself automatically.

Rollback = remove `VITE_OTP_PROVIDER` (or set `rpc-inapp`) and
redeploy the frontend; nothing server-side needs to change.

## Renter/session OTP without SMS (in-app + push nudge)

To cut SMS cost, the rental-session OTP can run fully in-app
(20260502125700) while REGISTRATION OTP keeps SMS:

```
VITE_RENTER_OTP_PROVIDER=rpc-inapp        # rental/session: in-app + push
VITE_REGISTRATION_OTP_PROVIDER=sms-edge   # signup: still SMS
# remove/ignore any legacy VITE_OTP_PROVIDER=sms-edge, or override it
# with VITE_RENTER_OTP_PROVIDER as above
```

In `rpc-inapp` mode the client calls merchant_start_renter_otp
directly (default p_delivery='inapp'): the customer reads the code
from the RenterOtpCard on Home as before, and additionally receives a
CODE-FREE push — title «رمز تحقق جديد», body «وصلك رمز تحقق لإكمال
إنشاء عقد إيجار. افتح التطبيق للاطلاع عليه.», deep link `/home` —
exactly one push per created challenge (a resend is a new challenge →
one new push; the 15s throttle prevents spam). The SMS path stays
deployed: otp-send now passes p_delivery='sms', which suppresses the
nudge, so flipping back to `sms-edge` later needs only the env change
(plus redeploying otp-send once so it sends p_delivery). Enabling the
in-app mode requires applying 20260502125700 and redeploying
push-dispatch (push_jobs gained an optional body column).

## Manual QA — one real SMS

Prereqs: secrets set, function deployed, an `sms-edge` build, a real
Saudi number registered on a **test customer** account.

1. Merchant login → إصدار عقد إيجار جديد → enter the test customer's
   mobile → إرسال رمز التحقق.
2. Expect the chip «أرسلنا رمز التحقق برسالة نصية إلى جوال العميل.»
   and, within moments, an SMS `رمز التحقق: XXXXXX` from your sender
   name on the test phone. The customer's Home must NOT show the
   in-app code card.
3. Enter a **wrong** code once → «الرمز غير صحيح…» (attempt counted).
4. Enter the real code → customer details appear; continue and issue
   the offer (P0195 passes).
5. Immediately tap resend twice → second tap shows the throttle
   message («تم إصدار رمز للتو…»).
6. Function logs (Dashboard → Edge Functions → otp-send → Logs):
   entries show only challenge id + masked number (`9665•••••XX`) +
   provider status — verify **no** OTP code, key, or message body
   appears.
7. Negative check: temporarily unset `MSEGAT_API_KEY` → send shows
   «خدمة رسائل التحقق غير مفعّلة…» and **no challenge is created**;
   restore the secret afterwards.

If MSEGAT rejects the send (non-`1`/`M0000` code in logs), check
sender-name approval and balance first; field names live only in
`_shared/msegat.ts` if the account's Postman doc differs.

## Security guardrails (also enforced by `npm run test:otp`)

- Credentials only via `Deno.env` inside the Edge Function; no
  hardcoded fallbacks; nothing MSEGAT-related under `src/`.
- Plaintext code: DB `code_inapp` (pre-existing, temporary) → one-time
  `get_renter_otp_for_dispatch` fetch (service-role only, revoked from
  anon/authenticated, single-use stamp) → MSEGAT request body. Never
  returned to the merchant client, never logged.
- Logs carry only challenge id, masked recipient, provider status code.
- Verification is structurally RPC-only: the client has no
  verify-via-provider path and the old Twilio `otp-verify` function
  was removed.

## Registration OTP (signup mobile verification)

A SECOND, independent OTP flow (20260502125600) reusing the SAME
MSEGAT secrets — no new credentials:

| Piece | Where |
|---|---|
| Challenge table + RPCs (hash-only, 5-min expiry, 5 attempts, 60s cooldown, 5 sends/hour) | `supabase/migrations/20260502125600_registration_otp.sql` |
| Edge Functions | `registration-otp-send`, `registration-otp-verify` |
| Client service + flags | `src/lib/otp/registration.ts`, `src/lib/otp/flags.ts` |
| Signup UI steps | customer: `src/pages/auth/Register.tsx` (SupabaseRegister); merchant: `src/pages/merchant/MerchantRegister.tsx` (authorized-rep step gate + final-submit guard) |
| Server stamps | customer: `profiles.mobile_verified_at`; merchant: `merchant_applications.contact_mobile_verified_at` — both via BEFORE INSERT triggers (role-scoped challenge consumed, single use) |

Independent switches (Vercel env, build-time; neither affects the
other flow, both default OFF/current behavior):

```
VITE_REGISTRATION_OTP_PROVIDER=sms-edge   # signup mobile verification
VITE_RENTER_OTP_PROVIDER=sms-edge         # renter/session SMS delivery
# (legacy VITE_OTP_PROVIDER=sms-edge still works for the renter flow)
```

Deploy additions: apply `20260502125600` in the SQL Editor, then
`supabase functions deploy registration-otp-send registration-otp-verify`
(JWT verification ON — the anonymous signup forms authenticate with
the project anon key). Covers BOTH customer and merchant signup —
the send call carries `role: 'customer'|'merchant'`, same function,
same secrets. DB test suite:
`supabase/tests/registration_otp_test.sql` (psql, never production).

Notes: verification is ours (`registration_otp_check`), MSEGAT only
sends; the send endpoint never reveals whether a mobile is already
registered (duplicates surface only at signup, as before); logs are
masked exactly like the renter flow.
