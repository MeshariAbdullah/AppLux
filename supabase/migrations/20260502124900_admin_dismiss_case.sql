-- =====================================================================
-- Administrative case closure — "إغلاق الحالة إداريًا".
--
-- NOT a judgment: dismissal is a neutral operational closure (erroneous
-- or duplicate report, invalid case). It never implies the customer is
-- innocent or the merchant is wrong, never marks the item returned,
-- never fabricates a settlement, and never touches eligibility — the
-- contract simply continues its normal lifecycle, and the later clean
-- close releases original_item_value exactly once (unchanged 124600
-- semantics; the existing dismissal branch of on_damage_case_resolved
-- performs no lifecycle mutation and only syncs the canonical phase).
--
-- The mandatory reason is stored in damage_cases.resolution_notes,
-- which BOTH parties can read under existing RLS — admins must write a
-- neutral, party-visible reason (the UI says so). No internal-only
-- commentary field is introduced.
-- =====================================================================

-- Event + notification vocabularies gain the dismissal entries.
alter table public.dispute_events drop constraint if exists dispute_events_event_type_check;
alter table public.dispute_events add constraint dispute_events_event_type_check
  check (event_type in (
    'claim_opened','customer_accepted','customer_objected','evidence_added',
    'direct_proposal_submitted','direct_proposal_accepted','direct_proposal_rejected',
    'direct_round_exhausted','moved_to_lend_mediation','lend_proposal_submitted',
    'merchant_accepted_lend_proposal','customer_accepted_lend_proposal',
    'lend_proposal_rejected','dispute_resolved','dispute_unresolved',
    'case_dismissed_by_lend'
  ));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'offer_issued',
  'dispute_claim_submitted','dispute_customer_accepted','dispute_customer_objected',
  'dispute_proposal_received','dispute_proposal_accepted','dispute_proposal_rejected',
  'dispute_moved_to_lend','dispute_lend_proposal','dispute_resolved','dispute_unresolved',
  'dispute_dismissed'
));

-- Include the new once-only type in the dedupe index.
drop index if exists notifications_dispute_event_once;
create unique index notifications_dispute_event_once
  on public.notifications (user_id, type, case_id)
  where case_id is not null
    and type in ('dispute_claim_submitted','dispute_customer_accepted',
                 'dispute_customer_objected','dispute_moved_to_lend',
                 'dispute_lend_proposal','dispute_resolved',
                 'dispute_unresolved','dispute_dismissed');

create or replace function public.admin_dismiss_dispute_case(
  p_case_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_owner uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrative closure is admin-only' using errcode = 'P0211';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'An administrative reason is required' using errcode = 'P0221';
  end if;
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  if v_case.dispute_phase = 'resolved' then
    raise exception 'Case is already closed' using errcode = 'P0201';
  end if;

  update damage_cases
  set status = 'dismissed',              -- triggers the phase sync only:
      dispute_phase = 'resolved',        -- no contract/eligibility change
      dispute_outcome = 'dismissed',
      resolved_at = now(),
      resolved_by_user_id = auth.uid(),
      resolution_notes = trim(p_reason), -- party-visible neutral reason
      updated_at = now()
  where id = p_case_id;

  perform public.dispute_event(p_case_id, 'case_dismissed_by_lend', auth.uid(), 'lend',
    jsonb_build_object('reason', trim(p_reason)));

  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_case.customer_user_id, 'dispute_dismissed', p_case_id);
  perform public.dispute_notify(v_owner, 'dispute_dismissed', p_case_id);
end;
$$;
grant execute on function public.admin_dismiss_dispute_case(uuid, text) to authenticated;
