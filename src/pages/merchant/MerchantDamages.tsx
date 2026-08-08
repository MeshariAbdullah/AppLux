import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Card, EmptyState, PageSkeleton, StatusChip, type StatusTone } from '@/components/ui';
import { AlertIcon, ChevronIcon, GavelIcon, InfoIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { damageSeverityTone as toneForSeverity } from '@/lib/format/statusTones';
import {
  fetchMyMerchant,
  fetchProfilesByIds,
  listMerchantContracts,
  listMerchantDamageCases,
  useSupabaseAuth,
  type DamageCaseRow,
} from '@/lib/supabase';
import type { MerchantDamageCase } from '@/lib/data';

// =====================================================================
// Merchant damage/dispute cases — LIVE + DB-backed (Phase-1 lifecycle).
// Cards render from canonical damage_cases rows: dispute_phase /
// dispute_outcome only — legacy `stage` never drives anything here.
// The demo store remains solely for the unconfigured demo build.
// =====================================================================

type LiveEntry = {
  row: DamageCaseRow;
  customerName: string;
  contractNumber: string | null;
};

export function disputePhaseTone(row: DamageCaseRow): StatusTone {
  if (row.dispute_phase === 'resolved') {
    return row.dispute_outcome === 'claim_accepted' ||
      row.dispute_outcome === 'direct_settlement' ||
      row.dispute_outcome === 'lend_settlement'
      ? 'success'
      : 'neutral';
  }
  if (row.dispute_phase === 'awaiting_customer') return 'warn';
  return 'brand';
}

export function disputePhaseLabelKey(row: DamageCaseRow): string {
  if (row.dispute_phase === 'resolved') {
    return `merchant.disputes.outcome.${row.dispute_outcome ?? 'dismissed'}`;
  }
  return `merchant.disputes.phase.${row.dispute_phase}`;
}

export default function MerchantDamages() {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const { merchantDamages } = useStore();
  const { configured, session } = useSupabaseAuth();
  const [live, setLive] = useState<LiveEntry[] | null>(null);
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(configured && session?.user?.id),
  );

  useEffect(() => {
    const userId = session?.user?.id;
    if (!configured || !userId) {
      setLive(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const merchant = await fetchMyMerchant(userId).catch(() => null);
      if (cancelled) return;
      if (!merchant) {
        setLive([]);
        setLoading(false);
        return;
      }
      const [rows, contracts] = await Promise.all([
        listMerchantDamageCases(merchant.id).catch(() => []),
        listMerchantContracts(merchant.id).catch(() => []),
      ]);
      if (cancelled) return;
      const profileMap = await fetchProfilesByIds(
        rows.map((r) => r.customer_user_id),
      ).catch(() => new Map());
      if (cancelled) return;
      const contractNum = new Map(contracts.map((c) => [c.id, c.contract_number]));
      setLive(
        rows.map((row) => ({
          row,
          customerName: profileMap.get(row.customer_user_id)?.full_name ?? '—',
          contractNumber: contractNum.get(row.contract_id) ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, session?.user?.id]);

  const demoOpen = merchantDamages.filter((d) => d.status !== 'settled');
  const demoSettled = merchantDamages.filter((d) => d.status === 'settled');
  const liveOpen = (live ?? []).filter((e) => e.row.dispute_phase !== 'resolved');
  const liveClosed = (live ?? []).filter((e) => e.row.dispute_phase === 'resolved');
  const empty = configured ? (live ?? []).length === 0 : merchantDamages.length === 0;

  return (
    <>
      <Header title={t('merchant.damages.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <p className="text-[12.5px] text-ink-500 leading-relaxed px-1">
            {t('merchant.damages.subtitle')}
          </p>

          {configured && loading ? (
            <PageSkeleton rows={3} />
          ) : empty ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('merchant.damages.empty')}
              description={t('merchant.damages.emptyHint')}
            />
          ) : configured ? (
            <>
              {liveOpen.length > 0 && (
                <div className="space-y-2.5">
                  {liveOpen.map((e) => (
                    <LiveCaseCard key={e.row.id} entry={e} />
                  ))}
                </div>
              )}
              {liveClosed.length > 0 && (
                <div>
                  <div className="text-[11.5px] font-semibold text-ink-400 uppercase tracking-wide px-1 mb-2">
                    {t('merchant.disputes.phase.resolved')}
                  </div>
                  <div className="space-y-2.5 opacity-90">
                    {liveClosed.map((e) => (
                      <LiveCaseCard key={e.row.id} entry={e} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {demoOpen.length > 0 && (
                <div className="space-y-2.5">
                  {demoOpen.map((d) => (
                    <DemoCard key={d.id} item={d} />
                  ))}
                </div>
              )}
              {demoSettled.length > 0 && (
                <div>
                  <div className="text-[11.5px] font-semibold text-ink-400 uppercase tracking-wide px-1 mb-2">
                    {t('merchant.damages.status.settled')}
                  </div>
                  <div className="space-y-2.5 opacity-90">
                    {demoSettled.map((d) => (
                      <DemoCard key={d.id} item={d} />
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

function LiveCaseCard({ entry }: { entry: LiveEntry }) {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const { row } = entry;
  const sevKey = row.severity === 'non_return' ? 'non-return' : row.severity;
  const latestAt = row.resolved_at ?? row.customer_response_at ?? row.raised_at;
  return (
    <Link to={`/merchant/damages/${row.id}`} className="block">
      <Card padded className="space-y-2.5 transition-transform active:scale-[0.995]">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-600 grid place-items-center">
            <GavelIcon size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-ink-900 truncate">
              {entry.customerName}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-400 truncate num" dir="ltr">
              {row.case_number}
              {entry.contractNumber ? ` · ${entry.contractNumber}` : ''}
            </div>
          </div>
          <ChevronIcon
            size={14}
            className={cn('text-ink-300 shrink-0', dir === 'rtl' ? '' : 'rotate-180')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip
            size="sm"
            tone={toneForSeverity(sevKey as 'partial' | 'total' | 'non-return')}
            dot={false}
            label={t(`merchant.damages.severity.${sevKey}`)}
          />
          <StatusChip
            size="sm"
            tone={disputePhaseTone(row)}
            dot
            label={t(disputePhaseLabelKey(row))}
          />
        </div>
        <div className="flex items-center justify-between text-[11.5px] text-ink-500">
          <span className="num">{formatCurrency(Number(row.claim_amount))}</span>
          <span className="num">{formatDate(latestAt)}</span>
        </div>
      </Card>
    </Link>
  );
}

// Demo-mode card (unconfigured builds only — unreachable in production).
function DemoCard({ item }: { item: MerchantDamageCase }) {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const severe = item.severity !== 'partial';
  return (
    <Link to={`/merchant/damages/${item.id}`} className="block">
      <Card padded className="space-y-2.5 transition-transform active:scale-[0.995]">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-600 grid place-items-center">
            {severe ? <AlertIcon size={17} /> : <GavelIcon size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-ink-900 truncate">
              {item.customerName}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-400 truncate num" dir="ltr">
              {item.id}
              {item.contractRef ? ` · ${item.contractRef}` : ''}
            </div>
          </div>
          <ChevronIcon
            size={14}
            className={cn('text-ink-300 shrink-0', dir === 'rtl' ? '' : 'rotate-180')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip
            size="sm"
            tone={toneForSeverity(item.severity)}
            dot={false}
            label={t(`merchant.damages.severity.${item.severity}`)}
          />
          <StatusChip
            size="sm"
            tone="brand"
            dot
            label={t(`merchant.damages.status.${item.status}`)}
          />
        </div>
        <div className="flex items-center justify-between text-[11.5px] text-ink-500">
          <span className="num">{formatCurrency(item.claimAmount)}</span>
          <span className="num">{formatDate(item.reportedAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
