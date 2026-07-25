-- =====================================================================
-- Customer notifications — offer-issued events
-- =====================================================================
-- AUDIT: no notifications infrastructure existed at all. Merchants
-- issue offers via a direct client INSERT into rental_invoices
-- (status 'issued', createInvoiceWithItems) — no RPC — so the only
-- transactional, client-independent creation point is a DATABASE
-- TRIGGER on rental_invoices. The customer Notifications page was a
-- static empty state; Commit B wires it to this table.
--
-- What this adds:
--   1. public.notifications — recipient-scoped rows. The ONLY event
--      type in this pass is 'offer_issued' (no other notification
--      events exist in the product today; adding more is a separate
--      approval). Deep-linking uses the invoice's scan_token (the
--      /review/:token route) so no internal UUID is ever shown.
--   2. notify_offer_issued() trigger — fires when an invoice is
--      INSERTed as 'issued' (today's flow) or UPDATEd into 'issued'
--      (covers a future draft→issued path). Idempotent: a UNIQUE
--      index on (user_id, type, invoice_id) + ON CONFLICT DO NOTHING
--      means retries/re-issues can never duplicate the notification.
--   3. RLS — customers SELECT/UPDATE only their own rows; a guard
--      trigger restricts end-user updates to read_at (errcode P0140).
--      No INSERT/DELETE policies: rows are created only by the
--      SECURITY DEFINER trigger.
--   4. BACKFILL — one idempotent insert creating notifications for
--      invoices still awaiting review (status 'issued'/'viewed'), so
--      the already-sent offer from the live report appears once this
--      is applied. Historical accepted/closed offers are NOT
--      backfilled (no stale "awaiting review" notifications).
--   5. Realtime publication membership (guarded) — realtime is
--      preferred but optional; the client refetches on mount/focus
--      regardless.
--
-- Idempotent throughout (if not exists / or replace / on conflict).
-- ROLLBACK: drop trigger notify_offer_issued_trg on rental_invoices;
-- drop function notify_offer_issued(); drop table notifications.
-- =====================================================================

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('offer_issued')),
  invoice_id   uuid references public.rental_invoices(id) on delete cascade,
  -- Display snapshot { ar, en } so the list renders without joins and
  -- without exposing merchant ids.
  merchant_display_name jsonb,
  -- Public deep-link token (the /review/:token route) — never a UUID.
  scan_token   text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Idempotency backbone: one notification per (recipient, event,
-- invoice). NULL invoice_id rows (future event types) stay unaffected
-- because NULLs never conflict.
create unique index if not exists notifications_event_once
  on public.notifications(user_id, type, invoice_id);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

-- Explicit grants (Supabase normally adds these via default
-- privileges; stated here so the migration is self-sufficient).
-- SELECT + UPDATE only — inserts happen solely through the SECURITY
-- DEFINER trigger, deletes not at all.
grant select, update on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- End users may flip read_at and nothing else.
create or replace function public.guard_notification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.type is distinct from old.type
       or new.invoice_id is distinct from old.invoice_id
       or new.merchant_display_name is distinct from old.merchant_display_name
       or new.scan_token is distinct from old.scan_token
       or new.created_at is distinct from old.created_at then
      raise exception 'only read_at may be updated on a notification'
        using errcode = 'P0140';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_columns on public.notifications;
create trigger notifications_guard_columns
  before update on public.notifications
  for each row
  execute function public.guard_notification_columns();

-- ---------------------------------------------------------------------
-- Offer-issued event — transactional with the invoice write itself.
-- ---------------------------------------------------------------------
create or replace function public.notify_offer_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name jsonb;
begin
  if (tg_op = 'INSERT' and new.status = 'issued')
     or (tg_op = 'UPDATE' and new.status = 'issued'
         and old.status is distinct from new.status) then
    select display_name into v_name from merchants where id = new.merchant_id;
    insert into public.notifications
      (user_id, type, invoice_id, merchant_display_name, scan_token)
    values
      (new.customer_user_id, 'offer_issued', new.id, v_name, new.scan_token)
    on conflict (user_id, type, invoice_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_offer_issued_trg on public.rental_invoices;
create trigger notify_offer_issued_trg
  after insert or update of status on public.rental_invoices
  for each row
  execute function public.notify_offer_issued();

comment on function public.notify_offer_issued() is
  'Creates the customer offer_issued notification in the same transaction as invoice issuance. Idempotent via notifications_event_once + ON CONFLICT DO NOTHING.';

-- ---------------------------------------------------------------------
-- Backfill offers still awaiting review (idempotent).
-- ---------------------------------------------------------------------
insert into public.notifications
  (user_id, type, invoice_id, merchant_display_name, scan_token, created_at)
select i.customer_user_id, 'offer_issued', i.id, m.display_name, i.scan_token,
       coalesce(i.issued_at, i.created_at)
from public.rental_invoices i
join public.merchants m on m.id = i.merchant_id
where i.status in ('issued', 'viewed')
on conflict (user_id, type, invoice_id) do nothing;

-- ---------------------------------------------------------------------
-- Realtime (optional enhancement; guarded for environments without
-- the supabase_realtime publication). The client works without it.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when undefined_object then null;   -- publication absent (local PG)
  when duplicate_object then null;   -- already a member
end;
$$;

notify pgrst, 'reload schema';
