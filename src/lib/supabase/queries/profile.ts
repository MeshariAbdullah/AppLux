import { requireSupabase } from '../client';
import type { ProfileRow, ProfileUpdate } from '../types';

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<ProfileRow> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
