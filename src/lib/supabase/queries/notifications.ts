import { requireSupabase } from '../client';
import type { NotificationRow } from '../types';

/**
 * Customer notifications (20260502123400). RLS scopes every query to
 * the caller's own rows — the userId parameter only exists so the
 * cache layer can key per-user; the DB is the authority.
 */
export async function listMyNotifications(): Promise<NotificationRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

/**
 * Mark one notification read. Fire-and-forget friendly: RLS + the
 * column guard mean the worst possible outcome is "0 rows updated".
 */
export async function markNotificationRead(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
}
