-- =====================================================================
-- AppLux MVP — Phase 7e merchant-context renter eligibility read
-- =====================================================================
-- Closes the gap that left the merchant rental session showing
-- "No eligibility profile yet" even when rental_eligibility.user_id
-- had a real row for the verified renter.
--
-- The merchant's session calls .from('rental_eligibility').select(...)
-- directly, but RLS on rental_eligibility only permits:
--   * the user themselves   (auth.uid() = user_id)
--   * admins                (public.is_admin())
-- so a merchant read silently returns zero rows.
--
-- This RPC fills the gap with the same pattern already used for
-- lookup_renter_by_mobile and confirm_renter_presence: SECURITY DEFINER
-- gated on merchant/admin role, returning a minimal projection that
-- doesn't leak admin-only fields (assigned_by / notes / updated_at).
-- =====================================================================

create or replace function public.get_renter_eligibility(p_renter_id uuid)
returns table (
  user_id      uuid,
  limit_amount numeric,
  used_amount  numeric,
  tier         public.eligibility_tier
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  -- Caller authorisation — merchants and admins only. Customers must
  -- continue to use the direct self-select policy on the table.
  select role into v_role from public.profiles where profiles.id = auth.uid();
  if v_role is null or v_role not in ('merchant', 'admin') then
    raise exception 'Only merchants can read renter eligibility' using errcode = 'P0030';
  end if;

  return query
  select e.user_id, e.limit_amount, e.used_amount, e.tier
    from public.rental_eligibility e
   where e.user_id = p_renter_id;
end;
$$;

grant execute on function public.get_renter_eligibility(uuid) to authenticated;
