import { requireSupabase } from '../client';
import type { NoteStatus, PromissoryNoteRow } from '../types';

export async function fetchNoteById(id: string): Promise<PromissoryNoteRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('promissory_notes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchNoteByContractId(
  contractId: string,
): Promise<PromissoryNoteRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('promissory_notes')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCustomerNotes(
  customerUserId: string,
  filter?: { status?: NoteStatus; limit?: number },
): Promise<PromissoryNoteRow[]> {
  const sb = requireSupabase();
  let q = sb
    .from('promissory_notes')
    .select('*')
    .eq('customer_user_id', customerUserId);
  if (filter?.status) q = q.eq('status', filter.status);
  if (filter?.limit) q = q.limit(filter.limit);
  q = q.order('due_date', { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
