import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { EmptyState, PageSkeleton } from '@/components/ui';
import { BellIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import {
  getSupabase,
  listMyNotifications,
  markNotificationRead,
  useSupabaseAuth,
  type NotificationRow,
} from '@/lib/supabase';

// =====================================================================
// Merchant notification center — /merchant/notifications.
//
// Reuses the existing notifications architecture end to end: the same
// table (RLS scopes rows to the signed-in merchant OWNER user), the
// same read/unread mechanism (read_at is the only mutable column,
// P0140-guarded), the same realtime-INSERT + focus-refetch pattern the
// customer page uses. Copy switches on the deployed 124700 type names;
// dispute rows deep-link the exact case UUID at /merchant/damages/:id.
// A row without case_id is safely inert (marked read, no navigation).
// No demo data in any mode.
// =====================================================================

export default function MerchantNotifications() {
  const t = useT();
  const { formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { configured, session } = useSupabaseAuth();
  const uid = session?.user?.id ?? null;

  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(() => configured && Boolean(uid));

  const refetch = useCallback(async () => {
    if (!configured || !uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setRows(await listMyNotifications());
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'list_merchant_notifications' }, err);
      setRows((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, [configured, uid]);

  useEffect(() => {
    void refetch();
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);

    // Realtime insertions — optional; focus/mount refetch is the
    // fallback when the channel cannot subscribe.
    let channel: ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null =
      null;
    try {
      const sb = configured ? getSupabase() : null;
      if (sb && uid) {
        channel = sb
          .channel('merchant-notifications')
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
      channel = null;
    }
    return () => {
      window.removeEventListener('focus', onFocus);
      try {
        channel?.unsubscribe();
      } catch {
        /* noop */
      }
    };
  }, [configured, uid, refetch]);

  const merchantName = (n: NotificationRow) => {
    const name = n.merchant_display_name;
    const preferred = locale === 'ar' ? name?.ar : name?.en;
    return preferred || name?.ar || name?.en || '';
  };

  const copyKey = (n: NotificationRow) =>
    n.type === 'offer_issued' ? 'offerIssued' : n.type;

  const open = (n: NotificationRow) => {
    if (!n.read_at) {
      setRows((prev) =>
        prev?.map((r) =>
          r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r,
        ) ?? prev,
      );
      markNotificationRead(n.id).catch((err) =>
        logEvent('rpc_failure', 'warn', { op: 'mark_notification_read' }, err),
      );
    }
    // Exact case UUID or nothing — never a generic list, never a
    // customer route.
    if (n.case_id) navigate(`/merchant/damages/${n.case_id}`);
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
      <Header title={t('notifications.title')} showBack />
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
                      {t(`notifications.${copyKey(n)}.title`)}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-500 leading-relaxed">
                      {t(`notifications.${copyKey(n)}.body`, {
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
