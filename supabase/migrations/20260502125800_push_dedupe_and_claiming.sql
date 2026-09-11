-- =====================================================================
-- Push pipeline idempotency — no duplicate deliveries
-- =====================================================================
-- ROOT CAUSES (duplicate-push audit, real-device 3× report):
--
--   1. push-dispatch had NO job claiming: it SELECTed status='pending'
--      rows, sent to every device token, and only THEN wrote the job
--      status (result unchecked). Any overlap — two cron ticks, a
--      manual invocation next to the schedule, more than one saved
--      schedule, a crash/timeout after the send, or a silently failed
--      status update — re-delivered the SAME job in full. This is the
--      primary duplicate mechanism: N overlapping/repeated runs = N
--      copies of the push.
--   2. One user can accumulate several NON-revoked device-token rows
--      for the SAME physical device (each reinstall / dev↔TestFlight
--      cycle registers a fresh token; the old one is only revoked if
--      APNs/FCM later reports it dead — which stale-but-still-routable
--      tokens never trigger). Every send then hits the same device
--      once per row.
--   3. dispute_proposal_* notifications are excluded from
--      notifications_dispute_event_once by design (they repeat per
--      proposal round) but had NO per-proposal uniqueness — only RPC
--      row-locks kept them single.
--
-- NOT causes (verified): push_jobs is unique per notification_id
-- (124800); all other dispute types are strictly-once per
-- (user, type, case) since 124700/124900 (extended by 125400);
-- renter_otp_ready is one row per OTP challenge behind a 15s throttle
-- (125700); registration OTP creates no notifications at all.
--
-- WHAT THIS ADDS (all additive; no applied migration is edited):
--   A. push_jobs claiming — 'processing' status + claimed_at, an
--      atomic claim RPC (FOR UPDATE SKIP LOCKED) and a guarded finish
--      RPC. Concurrent dispatcher runs can never pick up the same job;
--      a crashed run's jobs are requeued after 10 minutes, bounded by
--      the existing 5-attempt cap.
--   B. Same-device token dedupe — push_device_tokens.device_id (a
--      client-generated stable install id) + register_push_token now
--      revokes the user's OTHER tokens carrying the same device_id.
--      Multi-device accounts (iPhone + iPad) keep one token each;
--      reinstall leftovers die at the next registration.
--   C. Explicit idempotency key for proposal notifications — unique
--      (user_id, type, case_id, metadata->>'proposal_id'), preceded by
--      a duplicate cleanup keeping the earliest row. dispute_notify's
--      bare ON CONFLICT DO NOTHING already absorbs the violation.
--
-- Deploy order: apply AFTER 20260502125700, then redeploy the updated
-- push-dispatch function (it now claims via claim_push_jobs). The old
-- dispatcher keeps working against this schema in the interim ('
-- pending' rows still exist), so the two steps need not be atomic.
--
-- Idempotent. ROLLBACK: drop functions claim_push_jobs/finish_push_job,
-- restore the 124800 register_push_token body, drop index
-- notifications_dispute_proposal_once, restore the previous
-- push_jobs_status_check ('pending','sent','failed') after
-- `update push_jobs set status='pending' where status='processing'`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (A) push_jobs claiming
-- ---------------------------------------------------------------------

alter table public.push_jobs
  add column if not exists claimed_at timestamptz;

comment on column public.push_jobs.claimed_at is
  'When a dispatcher run claimed this job (status → processing). Jobs stuck in processing longer than 10 minutes are requeued by the next claim_push_jobs call (crash recovery), bounded by the 5-attempt cap.';

alter table public.push_jobs drop constraint if exists push_jobs_status_check;
alter table public.push_jobs add constraint push_jobs_status_check
  check (status in ('pending', 'processing', 'sent', 'failed'));

-- Atomic claim: requeue stale 'processing' leftovers, then move up to
-- p_batch pending jobs to 'processing' and return them. FOR UPDATE
-- SKIP LOCKED makes concurrent dispatcher invocations partition the
-- queue instead of double-sending it. attempts is incremented AT CLAIM
-- TIME so a run that dies mid-send still consumes an attempt.
create or replace function public.claim_push_jobs(p_batch integer default 50)
returns setof public.push_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role only (the dispatcher). Clients can never drain or
  -- replay the outbox.
  if current_user in ('anon', 'authenticated') then
    raise exception 'claim_push_jobs is service-only' using errcode = '42501';
  end if;

  -- Crash recovery: a dispatcher run that died mid-batch leaves jobs
  -- in 'processing'. After 10 minutes they go back to 'pending'
  -- (or 'failed' once the attempt cap is spent).
  update push_jobs
     set status = case when attempts >= 5 then 'failed' else 'pending' end,
         last_error = coalesce(last_error, 'dispatch run did not finish (requeued)')
   where status = 'processing'
     and claimed_at < now() - interval '10 minutes';

  return query
  with claimed as (
    select id from push_jobs
     where status = 'pending'
     order by created_at
     limit greatest(1, least(coalesce(p_batch, 50), 200))
       for update skip locked
  )
  update push_jobs pj
     set status = 'processing',
         claimed_at = now(),
         attempts = pj.attempts + 1
    from claimed
   where pj.id = claimed.id
  returning pj.*;
end;
$$;

revoke all on function public.claim_push_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_push_jobs(integer) to service_role;

-- Guarded finish: only a job THIS run holds (status='processing') can
-- transition, so a late/duplicate finish (or one racing a requeue)
-- writes nothing. attempts was already incremented at claim.
create or replace function public.finish_push_job(
  p_job_id uuid,
  p_delivered boolean,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'finish_push_job is service-only' using errcode = '42501';
  end if;

  update push_jobs
     set status = case
           when p_delivered then 'sent'
           when attempts >= 5 then 'failed'
           else 'pending'
         end,
         sent_at = case when p_delivered then now() else sent_at end,
         last_error = case when p_delivered then null
                           else left(coalesce(p_error, 'send failed'), 300) end
   where id = p_job_id
     and status = 'processing';
end;
$$;

revoke all on function public.finish_push_job(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finish_push_job(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------
-- (B) Same-device token dedupe
-- ---------------------------------------------------------------------

alter table public.push_device_tokens
  add column if not exists device_id text;

comment on column public.push_device_tokens.device_id is
  'Client-generated stable install id (UUID persisted in app storage). Lets re-registration revoke the SAME device''s older tokens without touching the user''s other devices. NULL on legacy rows and web.';

create index if not exists push_tokens_user_device_idx
  on public.push_device_tokens (user_id, device_id)
  where device_id is not null;

-- Single definition going forward: the 2-arg form is dropped so the
-- 3-arg form (with defaults) is the only overload — old clients
-- calling (p_token, p_platform) still resolve via the default.
drop function if exists public.register_push_token(text, text);
create or replace function public.register_push_token(
  p_token text,
  p_platform text default 'ios',
  p_device_id text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_device text := nullif(left(trim(coalesce(p_device_id, '')), 64), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'Invalid device token' using errcode = 'P0220';
  end if;

  insert into push_device_tokens (user_id, platform, token, device_id)
  values (auth.uid(), coalesce(p_platform, 'ios'), trim(p_token), v_device)
  on conflict (token) do update
    set user_id = auth.uid(),      -- token follows the signed-in user
        platform = excluded.platform,
        device_id = coalesce(excluded.device_id, push_device_tokens.device_id),
        revoked_at = null,
        updated_at = now();

  -- One active token per (user, physical device): a rotated/reinstall
  -- token supersedes the same device's previous ones. Other devices
  -- (different device_id, or legacy NULL rows) are untouched.
  if v_device is not null then
    update push_device_tokens
       set revoked_at = now(), updated_at = now()
     where user_id = auth.uid()
       and device_id = v_device
       and token <> trim(p_token)
       and revoked_at is null;
  end if;
end;
$$;
grant execute on function public.register_push_token(text, text, text) to authenticated;

comment on function public.register_push_token(text, text, text) is
  'Registers/refreshes a push token under the signed-in user. p_device_id (stable client install id) makes re-registration revoke the same device''s older tokens — the duplicate-delivery guard for reinstall/rotation leftovers.';

-- ---------------------------------------------------------------------
-- (C) Per-proposal idempotency for the repeatable dispute types
-- ---------------------------------------------------------------------
-- Cleanup first (keep the EARLIEST row per key; cascade removes its
-- push_jobs), otherwise the unique index cannot build if a duplicate
-- ever slipped through the RPC locks.

delete from public.notifications n
 using public.notifications keep
 where n.type in ('dispute_proposal_received', 'dispute_proposal_accepted',
                  'dispute_proposal_rejected')
   and n.case_id is not null
   and n.metadata->>'proposal_id' is not null
   and keep.user_id = n.user_id
   and keep.type = n.type
   and keep.case_id = n.case_id
   and keep.metadata->>'proposal_id' = n.metadata->>'proposal_id'
   and (keep.created_at < n.created_at
        or (keep.created_at = n.created_at and keep.id < n.id));

-- Explicit idempotency key: (recipient, event, case, proposal). The
-- proposal_id has been in the metadata of all three types since
-- 124700, so the key is total for these rows.
create unique index if not exists notifications_dispute_proposal_once
  on public.notifications (user_id, type, case_id, (metadata->>'proposal_id'))
  where case_id is not null
    and metadata->>'proposal_id' is not null
    and type in ('dispute_proposal_received', 'dispute_proposal_accepted',
                 'dispute_proposal_rejected');

notify pgrst, 'reload schema';
