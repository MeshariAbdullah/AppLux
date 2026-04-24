import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import { AlertIcon, ChevronIcon, GavelIcon, InfoIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type {
  MerchantDamageCase,
  MerchantDamageSeverity,
  MerchantDamageStatus,
} from '@/lib/data';

function toneForStatus(status: MerchantDamageStatus): StatusTone {
  if (status === 'settled') return 'success';
  if (status === 'investigating') return 'warn';
  return 'danger';
}

function toneForSeverity(severity: MerchantDamageSeverity): StatusTone {
  if (severity === 'total' || severity === 'non-return') return 'danger';
  return 'warn';
}

export default function MerchantDamages() {
  const t = useT();
  const { merchantDamages } = useStore();

  const open = merchantDamages.filter((d) => d.status !== 'settled');
  const settled = merchantDamages.filter((d) => d.status === 'settled');

  return (
    <>
      <Header title={t('merchant.damages.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <p className="text-[12.5px] text-ink-500 leading-relaxed px-1">
            {t('merchant.damages.subtitle')}
          </p>

          {merchantDamages.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('merchant.damages.empty')}
              description={t('merchant.damages.emptyHint')}
            />
          ) : (
            <>
              {open.length > 0 && (
                <div className="space-y-2.5">
                  {open.map((d) => (
                    <DamageCard key={d.id} item={d} />
                  ))}
                </div>
              )}
              {settled.length > 0 && (
                <div>
                  <div className="text-[11.5px] font-semibold text-ink-400 uppercase tracking-wide px-1 mb-2">
                    {t('merchant.damages.status.settled')}
                  </div>
                  <div className="space-y-2.5 opacity-90">
                    {settled.map((d) => (
                      <DamageCard key={d.id} item={d} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Screen>
    </>
  );
}

function DamageCard({ item }: { item: MerchantDamageCase }) {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const statusTone = toneForStatus(item.status);
  const sevTone = toneForSeverity(item.severity);
  const severe = item.severity !== 'partial';
  return (
    <Link to={`/merchant/damages/${item.id}`} className="block">
      <Card padded className="space-y-3 hover:ring-gold-200/70 transition-colors">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-danger-50 text-danger-600 grid place-items-center">
            {severe ? <AlertIcon size={18} /> : <GavelIcon size={18} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-ink-900 truncate">
              {item.customerName}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-400 truncate">
              {item.item}
            </div>
          </div>
          <StatusChip
            size="sm"
            tone={statusTone}
            dot
            label={t(`merchant.damages.status.${item.status}`)}
          />
          <ChevronIcon
            size={14}
            className={cn('text-ink-300', dir === 'rtl' ? '' : 'rotate-180')}
          />
        </div>

        <div className="flex items-center gap-2">
          <StatusChip
            size="sm"
            tone={sevTone}
            dot={false}
            label={t(`merchant.damages.severity.${item.severity}`)}
          />
          <span className="text-[11.5px] text-ink-400 num">
            {t('merchant.damages.linkedRental')} · {item.rentalId}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[11.5px]">
          <div>
            <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
              {t('merchant.damages.reportedOn')}
            </div>
            <div className="mt-0.5 font-semibold text-ink-900 num">
              {formatDate(item.reportedAt)}
            </div>
          </div>
          <div className="text-end">
            <div className="text-ink-400 uppercase tracking-wide text-[10.5px]">
              {t('merchant.damages.claim')}
            </div>
            <div className="mt-0.5 font-semibold text-ink-900 num">
              {formatCurrency(item.claimAmount)}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
