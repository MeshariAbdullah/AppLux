-- =====================================================================
-- Public contract reference — approved LND-XXXXXX format
-- =====================================================================
-- BEFORE: next_contract_number() (20260502120100) returned
--   'CN-' || YYYY || '-' || nextval(contract_number_seq)
-- — sequential, year-embedded, and count-revealing.
--
-- AFTER (this migration): the SAME function name/signature returns a
-- secure random reference:
--
--   LND-XXXXXX     e.g. LND-7K4M2P
--
--   * fixed Lend prefix 'LND'
--   * 6 uppercase alphanumeric chars from the approved 31-char set
--       ABCDEFGHJKMNPQRSTUVWXYZ23456789
--     (no O/0/I/1/L — visually ambiguous chars excluded)
--   * randomness from pgcrypto's gen_random_bytes with rejection
--     sampling (no modulo bias); derived from NOTHING predictable —
--     no merchant/customer number, year, sequence, UUID prefix,
--     timestamp, or identity data
--   * generated entirely server-side inside the SECURITY DEFINER
--     accept_rental_invoice RPC (the function's only caller — the RPC
--     needs NO change since the signature is identical)
--
-- Uniqueness: rental_contracts.contract_number is already UNIQUE
-- (initial schema). The generator additionally pre-checks existence
-- and retries (≤20 draws) on the ~1-in-887M collision; the UNIQUE
-- constraint remains the final guarantor for the theoretical
-- check-then-insert race.
--
-- Compatibility:
--   * internal UUID primary keys unchanged;
--   * existing CN-YYYY-NNNNNN references remain untouched and valid
--     (the column is format-free; nothing is rewritten);
--   * every surface displays contract_number verbatim, so old
--     references keep working and NEW contracts render LND-XXXXXX;
--   * invoice / note / damage-case numbering unchanged (separate
--     approval required);
--   * contract_number_seq is left in place (unused by the new body;
--     dropping it would break re-runs of historical files).
--
-- Keyspace: 31^6 = 887,503,681.
--
-- Idempotent (create or replace / if not exists). ROLLBACK: re-apply
-- the 20260502120100 body of next_contract_number().
-- =====================================================================

-- gen_random_bytes lives in pgcrypto (enabled by default on Supabase;
-- guarded for other environments).
create extension if not exists pgcrypto;

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
        v_byte := get_byte(gen_random_bytes(1), 0);
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
  'Public contract reference generator: LND- + 6 secure-random chars from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no O/0/I/1/L). Pre-checks + retries on collision; rental_contracts.contract_number UNIQUE is the final guarantor. Replaced the sequential CN-YYYY-NNNNNN scheme (20260502123200).';
