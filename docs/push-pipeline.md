# Push pipeline — duplicate-free delivery

Chain: `notifications` (one row per logical event & recipient) →
`push_jobs` (one job per notification, `unique(notification_id)`) →
`push-dispatch` (one delivery attempt per active device token).
Idempotency guards live at every hop (20260502125800):

| Hop | Guard |
|---|---|
| notifications | `notifications_event_once` (offers), `notifications_dispute_event_once` (strictly-once dispute types), `notifications_dispute_proposal_once` (per-proposal key `user_id+type+case_id+metadata->>'proposal_id'`); `renter_otp_ready` = one row per OTP challenge behind the 15 s throttle |
| push_jobs | `unique(notification_id)` + trigger `on conflict do nothing` |
| dispatcher | `claim_push_jobs` moves jobs `pending → processing` atomically (`FOR UPDATE SKIP LOCKED`) BEFORE sending, so overlapping cron ticks / manual invocations partition the queue instead of re-sending it; `finish_push_job` transitions only rows still in `processing` (a sent job can never be re-sent); crashed runs are requeued after 10 min, capped at 5 attempts |
| device tokens | `unique(token)` + per-install `device_id`: re-registration revokes the SAME device's older tokens (reinstall/rotation leftovers), other devices untouched; the dispatcher additionally de-duplicates token values per job and revokes tokens APNs/FCM report dead |

## Deploy (manual — never automatic)

1. Apply `20260502125800_push_dedupe_and_claiming.sql` in the SQL
   Editor (after 20260502125700).
2. Redeploy `push-dispatch` from `supabase/functions/push-dispatch/index.ts`
   (single-file; Verify JWT stays **OFF** — it authenticates via the
   `apikey` header). The old dispatcher keeps working between steps 1–2;
   the new one requires step 1 (it calls `claim_push_jobs`).
3. Ship the app build containing the updated `registerPush.ts`
   (sends `p_device_id`; falls back to the legacy signature until the
   migration is applied, so order is free).

## Production diagnostics (read-only)

```sql
-- Exactly ONE dispatch schedule should exist:
select jobid, jobname, schedule, command from cron.job
 where command ilike '%push-dispatch%';

-- Jobs that were delivered more than once show attempts > 1 with sent:
select status, attempts, count(*) from push_jobs group by 1, 2 order by 1, 2;

-- Users with several active tokens (reinstall leftovers get revoked at
-- the device's next app start once 125800 + the new build are live):
select user_id, platform, count(*) from push_device_tokens
 where revoked_at is null group by 1, 2 having count(*) > 1;
```

Note on the generic titles: all customer-side dispute pushes share
«لديك تحديث جديد على حالة إيجار», so several *distinct* events on one
case (e.g. proposal rejected + moved to Lend) look identical on the
lock screen. Those are separate notifications by design — check the
in-app Notifications screen before treating them as duplicates.

DB test suite: `supabase/tests/push_dedupe_test.sql` (psql, full
migration chain, never production). Structural suite:
`npm run test:push`.
