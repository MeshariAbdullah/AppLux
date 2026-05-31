/**
 * Wrap a promise with a hard timeout. Used on bootstrap queries so a
 * hung Supabase request can't permanently park a screen on a spinner.
 *
 * Used by:
 *   - SupabaseAuthProvider (profile fetch on auth state change)
 *   - MerchantHome (merchant identity + dashboard queries)
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
