-- =====================================================================
-- Push notifications (APNs) — device tokens + server-side outbox.
--
-- Architecture: the app registers its APNs token through a
-- server-authoritative RPC (ownership = auth.uid(); re-registering a
-- token moves it to the new signed-in user — device handovers).
-- Every DISPUTE notification row fans out to ONE push job (outbox);
-- the `push-dispatch` Edge Function drains pending jobs and talks to
-- APNs directly (p8 key lives ONLY in function secrets — never in the
-- client). Push copy is privacy-conscious: a generic localized line
-- per role, the deep-link route, and nothing else — no names, no
-- amounts, no claim details on the lock screen.
-- =====================================================================

create table if not exists public.push_device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null default 'ios' check (platform in ('ios')),
  token       text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists push_tokens_user_idx on public.push_device_tokens(user_id);

alter table public.push_device_tokens enable row level security;
-- Read own tokens only; ALL writes go through the RPCs below.
drop policy if exists push_tokens_select_own on public.push_device_tokens;
create policy push_tokens_select_own on public.push_device_tokens
  for select using (user_id = auth.uid());
grant select on public.push_device_tokens to authenticated;

create or replace function public.register_push_token(
  p_token text,
  p_platform text default 'ios'
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0090';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'Invalid device token' using errcode = 'P0220';
  end if;
  insert into push_device_tokens (user_id, platform, token)
  values (auth.uid(), coalesce(p_platform, 'ios'), trim(p_token))
  on conflict (token) do update
    set user_id = auth.uid(),      -- token follows the signed-in user
        platform = excluded.platform,
        revoked_at = null,
        updated_at = now();
end;
$$;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.revoke_push_token(p_token text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update push_device_tokens
  set revoked_at = now(), updated_at = now()
  where token = trim(p_token) and user_id = auth.uid();
end;
$$;
grant execute on function public.revoke_push_token(text) to authenticated;

-- ---------------------------------------------------------------------
-- Outbox: exactly one job per dispute notification row.
-- ---------------------------------------------------------------------

create table if not exists public.push_jobs (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- Generic, PII-free lock-screen copy + the in-app deep link.
  title           text not null,
  route           text not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed')),
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists push_jobs_pending_idx on public.push_jobs(status, created_at)
  where status = 'pending';

alter table public.push_jobs enable row level security;
-- service-role only: no policies, no grants — clients can never read
-- or write the outbox.

create or replace function public.on_notification_push_job()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role app_role;
begin
  -- Dispute events only (offer_issued keeps its in-app-only behavior).
  if new.case_id is null or new.type not like 'dispute_%' then
    return new;
  end if;
  select role into v_role from profiles where id = new.user_id;
  insert into push_jobs (notification_id, user_id, title, route)
  values (
    new.id,
    new.user_id,
    case when v_role = 'merchant'
         then 'يوجد تحديث جديد على حالة نزاع'
         else 'لديك تحديث جديد على حالة إيجار' end,
    case when v_role = 'merchant'
         then '/merchant/damages/' || new.case_id
         else '/disputes/' || new.case_id end
  )
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notification_push_job on public.notifications;
create trigger trg_notification_push_job
  after insert on public.notifications
  for each row execute function public.on_notification_push_job();
