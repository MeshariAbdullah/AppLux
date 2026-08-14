-- =====================================================================
-- Universal push fan-out: EVERY in-app notification = one push job.
--
-- Root causes this fixes (from the failed physical-device tests):
--   * on_notification_push_job() only handled `dispute_%` types with a
--     case_id — offer_issued (and any future type) never produced a
--     push job at all.
--   * AFTER INSERT means only NEW rows fan out. Notification rows that
--     already existed before 20260502124800 was applied (including a
--     dispute claim notification created in earlier testing, whose
--     re-insert is skipped by `on conflict do nothing` under the
--     notifications_event_once dedupe) can never create a job. This is
--     why a "real dispute" test could show notifications rows but an
--     empty push_jobs table.
--
-- New rule: any valid INSERT into public.notifications creates exactly
-- one push_jobs row (unique on notification_id, idempotent). Titles
-- stay generic and privacy-safe (no names, amounts, item or claim
-- details). Routes use ONLY real app routes:
--   dispute types + case_id → /disputes/:id (customer)
--                             /merchant/damages/:id (merchant)
--   offer_issued + scan_token → /review/:token (real customer route)
--   anything else → role fallback: /notifications (customer/admin)
--                                  /merchant/notifications (merchant)
-- No schema change to push_jobs is needed (title + route columns are
-- sufficient; there is deliberately no body column).
-- Historical rows are NOT backfilled — old notifications must not spam
-- devices when this deploys.
-- =====================================================================

create or replace function public.on_notification_push_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
  v_title text;
  v_route text;
begin
  select role into v_role from profiles where id = new.user_id;

  -- Generic, privacy-safe title per event family.
  v_title := case
    when new.type = 'offer_issued' then 'لديك عرض إيجار جديد'
    when new.type like 'dispute_%' and v_role = 'merchant'
      then 'يوجد تحديث جديد على حالة نزاع'
    when new.type like 'dispute_%'
      then 'لديك تحديث جديد على حالة إيجار'
    else 'لديك إشعار جديد من Lend'
  end;

  -- Deep link: specific real route when identifiers allow, otherwise
  -- the role's Notifications screen.
  v_route := case
    when new.type like 'dispute_%' and new.case_id is not null then
      case when v_role = 'merchant'
           then '/merchant/damages/' || new.case_id
           else '/disputes/' || new.case_id end
    when new.type = 'offer_issued' and new.scan_token is not null
      then '/review/' || new.scan_token
    when v_role = 'merchant' then '/merchant/notifications'
    else '/notifications'
  end;

  insert into push_jobs (notification_id, user_id, title, route)
  values (new.id, new.user_id, v_title, v_route)
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

-- The trigger itself is unchanged (AFTER INSERT on notifications →
-- on_notification_push_job); re-declared idempotently for safety.
drop trigger if exists trg_notification_push_job on public.notifications;
create trigger trg_notification_push_job
  after insert on public.notifications
  for each row execute function public.on_notification_push_job();
