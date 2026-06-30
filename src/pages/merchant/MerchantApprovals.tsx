import { useEffect, useState } from 'react';
import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
  PageSkeleton,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import {
  BadgeCheckIcon,
  ClockIcon,
  InfoIcon,
  ReceiptIcon,
  ShieldIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  fetchMyMerchant,
  fetchProfilesByIds,
  listMerchantInvoices,
  useSupabaseAuth,
  type ProfileRow,
  type RentalInvoiceRow,
} from '@/lib/supabase';
import { getInitials } from '@/lib/format/initials';
import type { MerchantApproval, MerchantApprovalStage } from '@/lib/data';

function toneForStage(stage: MerchantApprovalStage): StatusTone {
  if (stage === 'awaiting-nafith') return 'gold';
  if (stage === 'awaiting-customer') return 'warn';
  return 'brand';
}

function invoiceRowToApproval(
  row: RentalInvoiceRow,
  customer?: ProfileRow,
): MerchantApproval {
  const customerName = customer?.full_name ?? '—';
  const initials = getInitials(customerName);
  return {
    id: row.id,
    customerName,
    customerInitials: initials,
    item: `Invoice ${row.invoice_number}`,
    category: 'dress',
    amount: Number(row.total_amount),
    submittedAt: row.issued_at ?? row.created_at,
    branchId: row.branch_id ?? '',
    stage: 'awaiting-customer',
  };
}

export default function MerchantApprovals() {
  const t = useT();
  const { merchantApprovals: demoApprovals } = useStore();
  const { configured, session } = useSupabaseAuth();
  const [liveApprovals, setLiveApprovals] = useState<MerchantApproval[] | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(
    () => configured && Boolean(session?.user?.id),
  );

  useEffect(() => {
    const userId = session?.user?.id;
    if (!configured || !userId) {
      setLiveApprovals(null);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    let cancelled = false;
    (async () => {
      const myMerchant = await fetchMyMerchant(userId).catch(() => null);
      if (cancelled) return;
      if (!myMerchant) {
        setLiveApprovals([]);
        setLiveLoading(false);
        return;
      }
      const rows = await listMerchantInvoices(myMerchant.id, {
        status: 'issued',
      }).catch(() => []);
      if (cancelled) return;
      const profileMap = await fetchProfilesByIds(
        rows.map((r) => r.customer_user_id),
      ).catch(() => new Map());
      if (cancelled) return;
      setLiveApprovals(
        rows.map((r) => invoiceRowToApproval(r, profileMap.get(r.customer_user_id))),
      );
      setLiveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, session?.user?.id]);

  const merchantApprovals = liveApprovals ?? demoApprovals;
  return (
    <>
      <Header title={t('merchant.approvals.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          <p className="text-[12.5px] text-ink-500 leading-relaxed px-1">
            {t('merchant.approvals.subtitle')}
          </p>

          {configured && liveLoading ? (
            <PageSkeleton rows={3} />
          ) : merchantApprovals.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('merchant.approvals.empty')}
              description={t('merchant.approvals.emptyHint')}
            />
          ) : (
            <div className="space-y-2.5">
              {merchantApprovals.map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}

function ApprovalCard({ approval }: { approval: MerchantApproval }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const tone = toneForStage(approval.stage);
  const icon =
    approval.stage === 'awaiting-nafith' ? (
      <BadgeCheckIcon size={13} />
    ) : approval.stage === 'awaiting-customer' ? (
      <ClockIcon size={13} />
    ) : (
      <ShieldIcon size={13} />
    );
  return (
    <Card padded className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
          <ReceiptIcon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-ink-900 truncate">
            {approval.customerName}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-400 truncate">
            {approval.item}
          </div>
        </div>
        <StatusChip
          size="sm"
          tone={tone}
          dot={false}
          icon={icon}
          label={t(`merchant.approvals.stage.${approval.stage}`)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11.5px]">
        <div>
          <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
            {t('merchant.approvals.submittedOn')}
          </div>
          <div className="mt-0.5 font-semibold text-ink-900 num">
            {formatDate(approval.submittedAt)}
          </div>
        </div>
        <div className="text-end">
          <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
            {t('merchant.approvals.amount')}
          </div>
          <div className="mt-0.5 font-semibold text-ink-900 num">
            {formatCurrency(approval.amount)}
          </div>
        </div>
      </div>
    </Card>
  );
}
