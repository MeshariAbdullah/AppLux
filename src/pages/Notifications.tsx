import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { EmptyState, PageSkeleton } from '@/components/ui';
import { BellIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { logEvent } from '@/lib/observability/log';
import {
  getSupabase,
  listMyNotifications,
  markNotificationRead,
  useSupabaseAuth,
  type NotificationRow,
} from '@/lib/supabase';

// =====================================================================
// Customer notifications — real rows from public.notifications
// (20260502123400). The page was previously a static empty state.
//
// * Live mode: fetch on mount + refetch on window focus (the required
//   refresh/polling fallback), plus a best-effort realtime INSERT
//   subscription when the platform provides it.
// * Tap: optimistic mark-as-read (RLS-scoped, worst case 0 rows),
//   then deep-link into the offer review flow via the PUBLIC scan
//   token (/review/:token) — never an internal UUID.
// * Demo mode keeps the calm empty state — no fake notifications.
// =====================================================================

export default function Notifications() {
  const t = useT();
  const { locale, formatDate } = useI18n();
  const navigate = useNavigate();
  const { configured, session } = useSupabaseAuth();

  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState(configured);

  const refetch = useCallback(async () => {
    if (!configured) return;
    try {
      setRows(await listMyNotifications());
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'list_notifications' }, err);
      // Keep whatever we had; a transient failure must not blank the list.
      setRows((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void refetch();
    if (!configured) return;
    // Refresh fallback: refetch whenever the tab regains focus.
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);

    // Preferred path: realtime INSERTs (guarded — works only where the
    // notifications table is in the realtime publication).
    const sb = getSupabase();
    const uid = session?.user?.id;
    let channel: ReturnType<NonNullable<typeof sb>['channel']> | null = null;
    try {
      if (sb && uid) {
        channel = sb
          .channel('customer-notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${uid}`,
            },
            () => void refetch(),
          )
          .subscribe();
      }
    } catch {
      channel = null; // realtime unavailable — focus/mount refetch covers it
    }
    return () => {
      window.removeEventListener('focus', onFocus);
      if (channel && sb) void sb.removeChannel(channel);
    };
  }, [configured, refetch, session?.user?.id]);

  const merchantName = (n: NotificationRow) => {
    const name = n.merchant_display_name;
    const preferred = locale === 'ar' ? name?.ar : name?.en;
    return preferred || name?.ar || name?.en || '';
  };

  const open = (n: NotificationRow) => {
    if (!n.read_at) {
      // Optimistic — the row flips locally; the DB write is RLS-safe.
      setRows((prev) =>
        prev?.map((r) =>
          r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r,
        ) ?? prev,
      );
      markNotificationRead(n.id).catch((err) =>
        logEvent('rpc_failure', 'warn', { op: 'mark_notification_read' }, err),
      );
    }
    // Deep link: the public review token route; fall back to the
    // rentals list when no token exists.
    navigate(n.scan_token ? `/review/${n.scan_token}` : '/contracts');
  };

  const empty = (
    <EmptyState
      tone="gold"
      icon={<BellIcon size={22} />}
      title={t('notifications.empty')}
      description={t('app.tagline')}
    />
  );

  return (
    <>
      <Header title={t('notifications.title')} />
      <Screen className="bg-canvas">
        {!configured ? (
          empty
        ) : loading ? (
          <PageSkeleton rows={3} />
        ) : !rows || rows.length === 0 ? (
          empty
        ) : (
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px]">
            {rows.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <div className="h-px bg-beige-100" />}
                <button
                  type="button"
                  onClick={() => open(n)}
                  className="flex w-full items-start gap-3 py-3.5 text-start hover:bg-beige-50 transition-colors"
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.read_at ? 'bg-canvas-200' : 'bg-green-600',
                    )}
                    aria-label={n.read_at ? undefined : t('notifications.unread')}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[13.5px] tracking-tight',
                        n.read_at
                          ? 'font-semibold text-ink-600'
                          : 'font-bold text-ink-900',
                      )}
                    >
                      {t('notifications.offerIssued.title')}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-500 leading-relaxed">
                      {t('notifications.offerIssued.body', {
                        merchantName: merchantName(n),
                      })}
                    </span>
                    <span className="mt-1 block text-[11px] text-ink-400 num">
                      {formatDate(n.created_at)}
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </Screen>
    </>
  );
}
