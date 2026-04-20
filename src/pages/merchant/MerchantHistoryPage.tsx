import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import { HistoryIcon, InfoIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { MerchantHistoryOutcome, MerchantHistoryRecord } from '@/lib/data';

function toneForOutcome(outcome: MerchantHistoryOutcome): StatusTone {
  if (outcome === 'completed') return 'success';
  if (outcome === 'cancelled') return 'neutral';
  return 'danger';
}

export default function MerchantHistoryPage() {
  const t = useT();
  const { merchantHistory } = useStore();
  return (
    <>
      <Header title={t('merchant.history.title')} showBack />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-3">
          <p className="text-[12.5px] text-ink-500 leading-relaxed px-1">
            {t('merchant.history.subtitle')}
          </p>

          {merchantHistory.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('merchant.history.empty')}
              description={t('merchant.history.emptyHint')}
            />
          ) : (
            <Card padded className="space-y-1">
              {merchantHistory.map((h, i) => (
                <div key={h.id}>
                  <HistoryRow item={h} />
                  {i < merchantHistory.length - 1 && <div className="h-px bg-ink-100" />}
                </div>
              ))}
            </Card>
          )}
        </div>
      </Screen>
    </>
  );
}

function HistoryRow({ item }: { item: MerchantHistoryRecord }) {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const tone = toneForOutcome(item.outcome);
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="h-10 w-10 shrink-0 rounded-xl bg-ink-50 text-ink-500 grid place-items-center">
        <HistoryIcon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
          {item.customerName}
        </div>
        <div className="mt-0.5 text-[12px] text-ink-400 truncate">
          {item.item} · {t('merchant.history.closedOn')} {formatDate(item.closedAt)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="text-[13px] font-semibold num text-ink-900">
          {formatCurrency(item.totalAmount)}
        </div>
        <StatusChip
          size="sm"
          tone={tone}
          dot
          label={t(`merchant.history.outcome.${item.outcome}`)}
        />
      </div>
    </div>
  );
}
