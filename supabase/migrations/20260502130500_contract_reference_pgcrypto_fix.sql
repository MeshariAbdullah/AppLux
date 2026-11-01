-- =====================================================================
-- next_contract_number: schema-qualify gen_random_bytes (pgcrypto)
-- =====================================================================
-- ROOT CAUSE (found by the staging C2 lifecycle test, 2026-10-31):
-- customer acceptance fails with
--     42883: function gen_random_bytes(integer) does not exist
-- The call path is accept_rental_invoice() — SECURITY DEFINER with
-- `set search_path = public` — which calls next_contract_number()
-- (20260502123200). That body calls pgcrypto's gen_random_bytes(1)
-- UNQUALIFIED. On Supabase, pgcrypto lives in the `extensions`
-- schema; a function invoked from inside a SECURITY DEFINER caller
-- INHERITS the caller's pinned search_path, which excludes
-- `extensions` — so the name cannot resolve.
--
-- 20260502124400 fixed this exact class for digest() but explicitly
-- judged next_contract_number safe because it is not SECURITY DEFINER
-- and "inherits the session search_path". That reasoning holds only
-- when the caller is the session; it breaks when the caller is a
-- SECURITY DEFINER function with a pinned path — which is the ONLY
-- production call path (accept_rental_invoice is its sole caller).
-- Environments where pgcrypto is resolvable from `public` (older
-- projects, local replays) mask the bug, which is why it surfaced
-- only on a freshly-created Supabase project.
--
-- FIX: schema-qualify the call as extensions.gen_random_bytes, the
-- same pattern 124400 / 125100 / 125600 / 125700 already use. The
-- body is otherwise IDENTICAL to 20260502123200: same charset, same
-- rejection sampling, same collision retry, same P0120, same
-- signature, same volatility, same (non-)security mode — so CREATE OR
-- REPLACE preserves ownership and ACLs, and no grant changes are
-- needed. Safe everywhere: on databases where pgcrypto is in
-- `extensions` this is the fix; where pgcrypto is elsewhere the
-- qualified name simply must exist — Supabase guarantees it, and the
-- local replica mirrors it (see supabase/tests/
-- contract_reference_pgcrypto_test.sql).
-- =====================================================================

create or replace function public.next_contract_number()
returns text
language plpgsql
volatile
as $$
declare
  -- Approved set: A-Z minus O/I/L, digits 2-9 → 31 chars.
  charset constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_byte int;
  v_try  int := 0;
  i      int;
begin
  loop
    v_try  := v_try + 1;
    v_code := 'LND-';
    for i in 1..6 loop
      -- Rejection sampling: accept only bytes < 248 (= 8 × 31) so
      -- every charset position is exactly equally likely.
      loop
        v_byte := get_byte(extensions.gen_random_bytes(1), 0);
        exit when v_byte < 248;
      end loop;
      v_code := v_code || substr(charset, 1 + (v_byte % 31), 1);
    end loop;

    exit when not exists (
      select 1 from public.rental_contracts where contract_number = v_code
    );

    if v_try >= 20 then
      -- 20 consecutive collisions is practically impossible at any
      -- realistic table size; fail loudly rather than loop forever.
      raise exception 'could not allocate a unique contract reference'
        using errcode = 'P0120';
    end if;
  end loop;
  return v_code;
end;
$$;

comment on function public.next_contract_number() is
  'Public contract reference generator: LND- + 6 secure-random chars from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no O/0/I/1/L). Pre-checks + retries on collision; rental_contracts.contract_number UNIQUE is the final guarantor. gen_random_bytes schema-qualified (20260502130500) so the SECURITY DEFINER accept path resolves it on schemas where pgcrypto lives in `extensions`.';
