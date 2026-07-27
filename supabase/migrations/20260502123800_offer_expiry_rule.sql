-- =====================================================================
-- Offer expiry rule — one hour, server-assigned, visible
-- =====================================================================
-- AUDIT (reported): expires_at existed since the initial schema but
-- NOTHING ever populated it — the only issuance path (a direct client
-- INSERT from the merchant session) never passed a value, so every
-- real offer had expires_at IS NULL: reservations were held
-- indefinitely and the 123700 expiry guards were dead code. The UI
-- compounded it with an `expires_at ?? issued_at ?? created_at`
-- fallback that showed fake expiry copy (removed client-side in the
-- companion commit).
--
-- APPROVED RULE (server-assigned, server clock, client values are
-- OVERRIDDEN — never trusted):
--
--   expires_at = least(now() + interval '1 hour', starts_at)
--   expires_at = now() + interval '1 hour'          when starts_at is null
--
-- An offer is never actionable past its proposed rental start.
-- Assignment happens exactly ONCE, when the row ENTERS a customer-
-- reviewable state (INSERT as issued/viewed, or a transition into
-- them — e.g. a future draft→issued path). issued→viewed, refreshes,
-- and unrelated updates never extend or reset the expiry. Reissued
-- replacement offers are new rows and receive their own expiry once.
-- Historical accepted/rejected/cancelled/superseded rows are never
-- touched.
--
-- Starts already due: if starts_at <= now() at issuance, the offer
-- would be born unusable — issuance is REJECTED with P0180 so the
-- merchant fixes the start instead of sending a dead offer.
--
-- ONE-TIME GRACE BACKFILL (existing NULL actionable offers only):
--   status issued/viewed AND expires_at IS NULL →
--     starts_at in the future: least(now() + 1h, starts_at)
--     otherwise (null or already past): now() + 1h
--   The past-start exception is intentional for existing records so
--   customers are not cut off the instant this deploys. Accepted /
--   rejected / cancelled / superseded / draft rows and contracts are
--   untouched.
--
-- Read-only impact audit (run manually BEFORE applying if desired):
--   select count(*) from rental_invoices
--    where status in ('issued','viewed') and expires_at is null;
--
-- Reservations (20260502123600) and the action guards (20260502123700
-- P0170/P0171) already key off expires_at — this migration simply
-- makes the value real; releases happen automatically at expiry.
--
-- Idempotent (or-replace / backfill targets only NULL rows). ROLLBACK:
-- drop trigger rental_invoices_expiry_assign + function
-- assign_offer_expiry(); backfilled timestamps may stay (they are
-- valid data).
-- =====================================================================

create or replace function public.assign_offer_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only when ENTERING a customer-reviewable state.
  if new.status in ('issued', 'viewed')
     and (tg_op = 'INSERT' or old.status not in ('issued', 'viewed')) then

    -- A rental whose proposed start has already arrived cannot produce
    -- an actionable offer — refuse before the merchant sends it.
    if new.starts_at is not null and new.starts_at <= now() then
      raise exception 'Rental start time has arrived or passed'
        using errcode = 'P0180';
    end if;

    -- Server clock is the authority; any client-provided expiry is
    -- overridden. issued_at is stamped server-side when absent.
    new.issued_at  := coalesce(new.issued_at, now());
    new.expires_at := least(
      now() + interval '1 hour',
      coalesce(new.starts_at, 'infinity'::timestamptz)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rental_invoices_expiry_assign on public.rental_invoices;
create trigger rental_invoices_expiry_assign
  before insert or update of status on public.rental_invoices
  for each row
  execute function public.assign_offer_expiry();

comment on function public.assign_offer_expiry() is
  'Server-assigned offer expiry on entry into issued/viewed: least(now() + 1 hour, starts_at); client-provided values overridden; P0180 when the rental start already passed. Never re-fires on issued→viewed or unrelated updates.';

-- ---------------------------------------------------------------------
-- One-time grace for existing actionable offers with no expiry.
-- (Plain column update — neither the expiry trigger, which listens to
-- status changes only, nor the eligibility guard fires.)
-- ---------------------------------------------------------------------
update public.rental_invoices
   set expires_at = case
         when starts_at is not null and starts_at > now()
           then least(now() + interval '1 hour', starts_at)
         else now() + interval '1 hour'
       end,
       updated_at = now()
 where status in ('issued', 'viewed')
   and expires_at is null;

notify pgrst, 'reload schema';
