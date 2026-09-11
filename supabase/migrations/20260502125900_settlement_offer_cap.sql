-- =====================================================================
-- Settlement offer cap: no proposal above the ORIGINAL ITEM VALUE
-- =====================================================================
-- BUSINESS RULE: the maximum settlement offer for a dispute is the
-- original value of the rented piece on that case's contract — never a
-- fixed number. A 7,000 SAR dress caps offers at 7,000; a 3,200 SAR
-- one at 3,200. The item value is the ceiling of any conceivable
-- compensation (it is also the eligibility hold and the promissory
-- note principal), so an offer above it is always a data-entry error.
--
-- AUDIT (20260502124700 state): submit_settlement_proposal and
-- lend_submit_mediation_proposal only refused NULL/negative amounts —
-- zero and any amount above the item value were accepted, and nothing
-- guarded ACCEPTING such a proposal. The cap existed nowhere (UI or
-- DB).
--
-- WHAT THIS ADDS (function replacements only; bodies preserved
-- verbatim plus the new guards — rounds logic, events, notifications
-- and phase transitions unchanged):
--   * settlement_offer_cap(contract_id) — the single cap source:
--     contract.original_item_value, falling back to the invoice's
--     original_item_value (contracts predating 20260502120500), then
--     contract.total_amount. Internal only.
--   * submit_settlement_proposal / lend_submit_mediation_proposal:
--     amount must be > 0 (P0210) and ≤ cap (NEW errcode P0213).
--   * respond_to_settlement_proposal / respond_to_lend_proposal:
--     ACCEPTING a proposal above the cap is refused with P0213
--     (protects against legacy over-cap proposals created before this
--     migration — their stored amounts are NOT modified). Rejecting
--     one remains allowed, so the settlement flow always has an exit.
--
-- New error code: P0213 settlement offer exceeds original item value.
-- Idempotent. ROLLBACK: re-apply the 20260502124700 bodies of the four
-- functions and drop settlement_offer_cap.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Cap source — one definition for every proposal path
-- ---------------------------------------------------------------------

create or replace function public.settlement_offer_cap(p_contract_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           nullif(c.original_item_value, 0),
           nullif(i.original_item_value, 0),
           c.total_amount
         )
    from rental_contracts c
    left join rental_invoices i on i.id = c.invoice_id
   where c.id = p_contract_id;
$$;
revoke all on function public.settlement_offer_cap(uuid) from public, anon, authenticated;

comment on function public.settlement_offer_cap(uuid) is
  'Maximum settlement offer for a dispute on this contract = the original item value (contract snapshot, invoice fallback for pre-120500 rows, then total_amount). Internal: consumed by the four proposal RPCs; never client-callable.';

-- ---------------------------------------------------------------------
-- (2) submit_settlement_proposal — > 0 and ≤ cap
-- ---------------------------------------------------------------------

create or replace function public.submit_settlement_proposal(
  p_case_id uuid,
  p_amount numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_party dispute_party;
  v_round int;
  v_id uuid;
  v_counterparty_uid uuid;
  v_cap numeric;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  v_party := public.dispute_party_of(v_case, v_uid);
  if v_party is null then
    raise exception 'Not a party to this dispute' using errcode = 'P0200';
  end if;
  if v_case.dispute_phase <> 'direct_settlement' then
    raise exception 'Direct settlement is not open in this phase'
      using errcode = 'P0201';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid settlement amount' using errcode = 'P0210';
  end if;
  -- Offer ceiling: the original item value on this case's contract.
  v_cap := public.settlement_offer_cap(v_case.contract_id);
  if v_cap is not null and p_amount > v_cap then
    raise exception 'Settlement offer exceeds the original item value (max %)', v_cap
      using errcode = 'P0213';
  end if;
  if exists (select 1 from dispute_settlement_proposals
             where case_id = p_case_id and status = 'pending') then
    raise exception 'A proposal is already awaiting a response'
      using errcode = 'P0203';
  end if;

  -- Server-side round counting — never client-supplied.
  select count(*) + 1 into v_round from dispute_settlement_proposals
  where case_id = p_case_id and kind = 'direct';
  if v_round > 2 then
    raise exception 'Both direct settlement rounds have been used'
      using errcode = 'P0204';
  end if;

  insert into dispute_settlement_proposals
    (case_id, kind, round, proposed_by_party, proposed_by_user_id, amount, note)
  values (p_case_id, 'direct', v_round, v_party, v_uid, p_amount, nullif(trim(p_note), ''))
  returning id into v_id;

  perform public.dispute_event(p_case_id, 'direct_proposal_submitted', v_uid, v_party,
    jsonb_build_object('proposal_id', v_id, 'round', v_round, 'amount', p_amount));

  select case when v_party = 'customer' then m.owner_user_id
              else v_case.customer_user_id end
  into v_counterparty_uid
  from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_counterparty_uid, 'dispute_proposal_received', p_case_id,
    jsonb_build_object('proposal_id', v_id, 'round', v_round, 'amount', p_amount));

  return v_id;
end;
$$;
grant execute on function public.submit_settlement_proposal(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- (3) respond_to_settlement_proposal — accepting over-cap refused
-- ---------------------------------------------------------------------

create or replace function public.respond_to_settlement_proposal(
  p_proposal_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop dispute_settlement_proposals%rowtype;
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_party dispute_party;
  v_owner uuid;
  v_proposer_uid uuid;
  v_cap numeric;
begin
  -- Consistent lock ordering across all RPCs: case row first, then the
  -- proposal row.
  select * into v_prop from dispute_settlement_proposals
  where id = p_proposal_id;
  if not found or v_prop.kind <> 'direct' then
    raise exception 'Proposal not found' using errcode = 'P0205';
  end if;
  select * into v_case from damage_cases where id = v_prop.case_id for update;
  select * into v_prop from dispute_settlement_proposals
  where id = p_proposal_id for update;

  v_party := public.dispute_party_of(v_case, v_uid);
  if v_party is null then
    raise exception 'Not a party to this dispute' using errcode = 'P0200';
  end if;
  if v_party = v_prop.proposed_by_party then
    raise exception 'You cannot respond to your own proposal'
      using errcode = 'P0206';
  end if;
  if v_prop.status <> 'pending' or v_case.dispute_phase <> 'direct_settlement' then
    raise exception 'This proposal is no longer awaiting a response'
      using errcode = 'P0205';
  end if;
  -- A legacy proposal above today's cap can be REJECTED (settlement
  -- continues) but never ACCEPTED. Amounts are never rewritten.
  if p_accept then
    v_cap := public.settlement_offer_cap(v_case.contract_id);
    if v_cap is not null and v_prop.amount > v_cap then
      raise exception 'Settlement offer exceeds the original item value (max %)', v_cap
        using errcode = 'P0213';
    end if;
  end if;

  insert into dispute_proposal_responses (proposal_id, party, responded_by_user_id, accepted)
  values (p_proposal_id, v_party, v_uid, p_accept);

  update dispute_settlement_proposals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      resolved_at = now()
  where id = p_proposal_id;

  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  v_proposer_uid := case when v_prop.proposed_by_party = 'customer'
                         then v_case.customer_user_id else v_owner end;

  if p_accept then
    perform public.dispute_event(v_case.id, 'direct_proposal_accepted', v_uid, v_party,
      jsonb_build_object('proposal_id', p_proposal_id, 'round', v_prop.round,
                         'amount', v_prop.amount));
    perform public.dispute_notify(v_proposer_uid, 'dispute_proposal_accepted', v_case.id,
      jsonb_build_object('proposal_id', p_proposal_id, 'amount', v_prop.amount));
    perform public.resolve_dispute_case(
      v_case.id, 'direct_settlement', v_prop.amount, v_uid, v_party);
    return;
  end if;

  perform public.dispute_event(v_case.id, 'direct_proposal_rejected', v_uid, v_party,
    jsonb_build_object('proposal_id', p_proposal_id, 'round', v_prop.round,
                       'amount', v_prop.amount));
  perform public.dispute_notify(v_proposer_uid, 'dispute_proposal_rejected', v_case.id,
    jsonb_build_object('proposal_id', p_proposal_id, 'amount', v_prop.amount));

  if v_prop.round >= 2 then
    -- Both direct rounds exhausted → AUTOMATIC transition. No manual
    -- escalate button exists or is needed.
    update damage_cases
    set dispute_phase = 'lend_mediation', updated_at = now()
    where id = v_case.id;
    perform public.dispute_event(v_case.id, 'direct_round_exhausted', null, null,
      jsonb_build_object('rounds_used', 2));
    perform public.dispute_event(v_case.id, 'moved_to_lend_mediation', null, null);
    perform public.dispute_notify(v_case.customer_user_id, 'dispute_moved_to_lend', v_case.id);
    perform public.dispute_notify(v_owner, 'dispute_moved_to_lend', v_case.id);
  end if;
end;
$$;
grant execute on function public.respond_to_settlement_proposal(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- (4) lend_submit_mediation_proposal — same > 0 and ≤ cap rule
-- ---------------------------------------------------------------------

create or replace function public.lend_submit_mediation_proposal(
  p_case_id uuid,
  p_amount numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_owner uuid;
  v_cap numeric;
begin
  if not public.is_admin() then
    raise exception 'Lend mediation is admin-only' using errcode = 'P0211';
  end if;
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  if v_case.dispute_phase <> 'lend_mediation' then
    raise exception 'Case is not in Lend mediation' using errcode = 'P0201';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid settlement amount' using errcode = 'P0210';
  end if;
  v_cap := public.settlement_offer_cap(v_case.contract_id);
  if v_cap is not null and p_amount > v_cap then
    raise exception 'Settlement offer exceeds the original item value (max %)', v_cap
      using errcode = 'P0213';
  end if;
  if exists (select 1 from dispute_settlement_proposals
             where case_id = p_case_id and kind = 'lend') then
    raise exception 'A Lend mediation proposal already exists'
      using errcode = 'P0207';
  end if;

  insert into dispute_settlement_proposals
    (case_id, kind, round, proposed_by_party, proposed_by_user_id, amount, note)
  values (p_case_id, 'lend', null, 'lend', v_uid, p_amount, nullif(trim(p_note), ''))
  returning id into v_id;

  perform public.dispute_event(p_case_id, 'lend_proposal_submitted', v_uid, 'lend',
    jsonb_build_object('proposal_id', v_id, 'amount', p_amount));
  select m.owner_user_id into v_owner from merchants m where m.id = v_case.merchant_id;
  perform public.dispute_notify(v_case.customer_user_id, 'dispute_lend_proposal', p_case_id,
    jsonb_build_object('proposal_id', v_id, 'amount', p_amount));
  perform public.dispute_notify(v_owner, 'dispute_lend_proposal', p_case_id,
    jsonb_build_object('proposal_id', v_id, 'amount', p_amount));
  return v_id;
end;
$$;
grant execute on function public.lend_submit_mediation_proposal(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- (5) respond_to_lend_proposal — accepting over-cap refused
-- ---------------------------------------------------------------------

create or replace function public.respond_to_lend_proposal(
  p_case_id uuid,
  p_accept boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case damage_cases%rowtype;
  v_prop dispute_settlement_proposals%rowtype;
  v_uid uuid := auth.uid();
  v_party dispute_party;
  v_other_accepted boolean;
  v_cap numeric;
begin
  select * into v_case from damage_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found' using errcode = 'P0209';
  end if;
  v_party := public.dispute_party_of(v_case, v_uid);
  if v_party is null then
    raise exception 'Not a party to this dispute' using errcode = 'P0200';
  end if;
  if v_case.dispute_phase <> 'lend_mediation' then
    raise exception 'Case is not in Lend mediation' using errcode = 'P0201';
  end if;

  select * into v_prop from dispute_settlement_proposals
  where case_id = p_case_id and kind = 'lend' for update;
  if not found or v_prop.status <> 'pending' then
    raise exception 'No Lend proposal is awaiting responses'
      using errcode = 'P0205';
  end if;

  if exists (select 1 from dispute_proposal_responses
             where proposal_id = v_prop.id and party = v_party) then
    raise exception 'This party already responded to the Lend proposal'
      using errcode = 'P0208';
  end if;

  -- Same legacy protection as the direct rounds: an over-cap Lend
  -- proposal can be rejected but never accepted.
  if p_accept then
    v_cap := public.settlement_offer_cap(v_case.contract_id);
    if v_cap is not null and v_prop.amount > v_cap then
      raise exception 'Settlement offer exceeds the original item value (max %)', v_cap
        using errcode = 'P0213';
    end if;
  end if;

  insert into dispute_proposal_responses (proposal_id, party, responded_by_user_id, accepted)
  values (v_prop.id, v_party, v_uid, p_accept);

  if p_accept then
    perform public.dispute_event(p_case_id,
      case when v_party = 'merchant' then 'merchant_accepted_lend_proposal'
           else 'customer_accepted_lend_proposal' end,
      v_uid, v_party, jsonb_build_object('proposal_id', v_prop.id));

    select bool_or(accepted) into v_other_accepted
    from dispute_proposal_responses
    where proposal_id = v_prop.id and party <> v_party;

    if coalesce(v_other_accepted, false) then
      -- BOTH parties accepted → agreement through Lend.
      update dispute_settlement_proposals
      set status = 'accepted', resolved_at = now() where id = v_prop.id;
      perform public.resolve_dispute_case(
        p_case_id, 'lend_settlement', v_prop.amount, v_uid, v_party);
    end if;
    -- One acceptance alone resolves nothing.
    return;
  end if;

  -- A rejection ends settlement through Lend. Final unresolved state:
  -- neutral, no judgment, nothing legacy touched.
  update dispute_settlement_proposals
  set status = 'rejected', resolved_at = now() where id = v_prop.id;
  perform public.dispute_event(p_case_id, 'lend_proposal_rejected', v_uid, v_party,
    jsonb_build_object('proposal_id', v_prop.id));
  perform public.resolve_dispute_case(
    p_case_id, 'unresolved', null, v_uid, v_party);
end;
$$;
grant execute on function public.respond_to_lend_proposal(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
