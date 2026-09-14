# Auth email branding — password reset from a Lend address

Goal: the "Forgot password" email arrives **from Lend**
(`no-reply@lend.sa` — or `support@lend.sa` if that is the approved
sender), not from Supabase's default sender
(`noreply@mail.app.supabase.io`).

The sender identity is a **Supabase Dashboard / DNS** concern — no
code sends this email. The app's only code-side responsibilities are
already in place (see "Code side" below).

---

## Why the email says "Supabase" today

Without custom SMTP, Supabase Auth sends every auth email through its
shared built-in mailer: sender `noreply@mail.app.supabase.io`, default
template, and heavy rate limits (a couple of emails/hour — not
production-grade). Fixing the sender therefore means enabling
**custom SMTP** with a Lend mailbox/provider, plus DNS records so the
provider may send as `@lend.sa`.

## Code side (already done — nothing else to change)

* `src/pages/auth/ForgotPassword.tsx` →
  `sendPasswordResetEmail` (`src/lib/supabase/auth.ts`) →
  `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
* `redirectTo` comes from `passwordResetRedirectUrl()`:
  the current origin on web deploys, or **`VITE_APP_ORIGIN`** (set it
  to the canonical web origin, e.g. `https://app.lend.sa`) — required
  for the iOS/Android builds, where the webview origin
  (`capacitor://localhost`) cannot appear in an email link.
* `/auth/reset-password` (`src/pages/auth/ResetPassword.tsx`) consumes
  the recovery token via `detectSessionInUrl` + `PASSWORD_RECOVERY`
  and updates the password.
* No SMTP credentials exist anywhere in the frontend or repo — they
  live only in the Dashboard.

## Supabase Dashboard steps (exact)

### 1. Custom SMTP (the sender fix)

Dashboard → **Project Settings → Authentication** (section “SMTP
Settings”; on newer dashboards: **Authentication → Emails → SMTP
Settings**):

1. Toggle **Enable Custom SMTP**.
2. **Sender email**: `no-reply@lend.sa` (or `support@lend.sa` — use
   the mailbox that actually exists at the email provider).
3. **Sender name**: `Lend` (or `ليند` if an Arabic display name is
   preferred in inboxes).
4. **Host / Port / Username / Password**: from the email provider
   (e.g. Google Workspace relay, Zoho, Resend, SES, Postmark).
   Typical: host `smtp.<provider>.com`, port `465` (SSL) or `587`
   (STARTTLS), username = full mailbox or API user, password = the
   provider's SMTP password/API key. **Enter these ONLY here — never
   in the repo or Vercel env.**
5. Save, then adjust **Rate limits** (Authentication → Rate Limits →
   "Rate limit for sending emails") — custom SMTP unlocks it; set a
   sane value (e.g. 30/hour) instead of the built-in mailer's cap.

### 2. URL configuration (redirect allow-list)

Dashboard → **Authentication → URL Configuration**:

* **Site URL**: the production web origin, e.g. `https://app.lend.sa`.
* **Redirect URLs** — must contain every origin the reset link may
  point at:
  * `https://app.lend.sa/auth/reset-password` (production — match the
    real deployed domain)
  * `https://<project>.vercel.app/auth/reset-password` (if the Vercel
    preview/prod domain is used)
  * `http://localhost:5173/auth/reset-password` (local dev, optional)

  A `redirectTo` not in this list is silently replaced by the Site
  URL, which would land users on `/` instead of the reset form.

### 3. Email template (branding + Arabic)

Dashboard → **Authentication → Emails → Templates → Reset password**
("Recovery"). Subject and body are free-form; keep
`{{ .ConfirmationURL }}` as the link. Suggested bilingual template
(Arabic-first, matching the app's copy):

Subject:

```
إعادة تعيين كلمة المرور — ليند | Reset your Lend password
```

Body (HTML):

```html
<div dir="rtl" style="font-family:-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1917">
  <h2 style="margin:0 0 12px">إعادة تعيين كلمة المرور</h2>
  <p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في <strong>ليند</strong>.
     اضغط الزر التالي لتعيين كلمة مرور جديدة. الرابط صالح لمدة ساعة.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="{{ .ConfirmationURL }}"
       style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:12px;display:inline-block">
      تعيين كلمة مرور جديدة
    </a>
  </p>
  <p style="color:#78716c;font-size:13px">إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — لن يتغير شيء في حسابك.</p>
  <hr style="border:none;border-top:1px solid #e7e5e4;margin:20px 0">
  <div dir="ltr" style="color:#57534e;font-size:13px">
    <p style="margin:0 0 8px">We received a request to reset your <strong>Lend</strong> password.
       Use the button above to set a new one. The link is valid for one hour.</p>
    <p style="margin:0">If you didn't request this, you can safely ignore this email.</p>
  </div>
</div>
```

(Registration/confirmation templates can be branded the same way
later; this task changes only the reset email.)

## DNS / SMTP sender authentication (required)

Configured at the DNS host for `lend.sa`, with the exact values given
by the chosen email provider — without these, Lend-branded mail lands
in spam or is rejected:

* **SPF** — TXT on `lend.sa` including the provider, e.g.
  `v=spf1 include:<provider-spf> ~all` (one merged SPF record only).
* **DKIM** — CNAME/TXT selector records from the provider
  (e.g. `s1._domainkey.lend.sa → ...`).
* **DMARC** — recommended TXT on `_dmarc.lend.sa`, e.g.
  `v=DMARC1; p=quarantine; rua=mailto:support@lend.sa`.

If the website email setup (the earlier domain-email work) already
created SPF/DKIM for this provider, reuse it — just confirm the
sending domain the provider verifies matches `lend.sa`.

## Manual test checklist (after the dashboard config)

1. App → Login → «نسيت كلمة المرور؟» → enter an existing account
   email → submit.
2. Inbox: sender shows **Lend `<no-reply@lend.sa>`** (not Supabase),
   Arabic-first template.
3. Open the link → lands on `<origin>/auth/reset-password` with the
   form enabled (not the "invalid link" state).
4. Set a new password → success screen → auto-redirect.
5. Sign out, sign in with the NEW password → works; old password
   refused.
6. Repeat once from the iOS build (link must open the production web
   origin from `VITE_APP_ORIGIN`).
