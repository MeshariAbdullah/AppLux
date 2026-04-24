import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
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
import type { MerchantApproval, MerchantApprovalStage } from '@/lib/data';

function toneForStage(stage: MerchantApprovalStage): StatusTone {
  if (stage === 'awaiting-nafith') return 'gold';
  if (stage === 'awaiting-customer') return 'warn';
  return 'brand';
}

export default function MerchantApprovals() {
  const t = useT();
  const { merchantApprovals } = useStore();
  return (
    <>
      <Header title={t('merchant.approvals.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          <p className="text-[12.5px] text-ink-500 leading-relaxed px-1">
            {t('merchant.approvals.subtitle')}
          </p>

          {merchantApprovals.length === 0 ? (
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
