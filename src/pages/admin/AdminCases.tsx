import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Card, EmptyState, PageSkeleton, StatusChip, type StatusTone } from '@/components/ui';
import { ChevronIcon, GavelIcon, InfoIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import {
  fetchContractsByIds,
  fetchMerchantsByIds,
  fetchProfilesByIds,
  listAllDamageCases,
  useSupabaseAuth,
  type DamageCaseRow,
} from '@/lib/supabase';

// =====================================================================
// /admin/cases — LIVE + DB-backed only (Phase-1 dispute lifecycle).
// The legacy hybrid (live rows + SEED counters + fake overdue tab +
// stage chips) is gone: no demo store, no localStorage overrides, no
// nafith/execution stages. Filters and chips derive exclusively from
// canonical dispute_phase / dispute_outcome. Every row deep-links the
// real case UUID at /admin/cases/:id.
// =====================================================================

type Entry = {
  row: DamageCaseRow;
  customerName: string;
  merchantName: string;
  contractNumber: string | null;
};

type Filter =
  | 'all'
  | 'awaiting_customer'
  | 'direct_settlement'
  | 'lend_mediation'
  | 'agreed'
  | 'unresolved'
  | 'dismissed';

const FILTERS: Filter[] = [
  'all',
  'awaiting_customer',
  'direct_settlement',
  'lend_mediation',
  'agreed',
  'unresolved',
  'dismissed',
];

const AGREED: ReadonlyArray<string | null> = [
  'claim_accepted',
  'direct_settlement',
  'lend_settlement',
];

export function adminPhaseTone(row: DamageCaseRow): StatusTone {
  if (row.dispute_phase === 'resolved') {
    return AGREED.includes(row.dispute_outcome) ? 'success' : 'neutral';
  }
  if (row.dispute_phase === 'lend_mediation') return 'gold';
  if (row.dispute_phase === 'awaiting_customer') return 'warn';
  return 'brand';
}

export function adminPhaseLabelKey(row: DamageCaseRow): string {
  if (row.dispute_phase === 'resolved') {
    return `merchant.disputes.outcome.${row.dispute_outcome ?? 'dismissed'}`;
  }
  return `merchant.disputes.phase.${row.dispute_phase}`;
}

function matchesFilter(row: DamageCaseRow, f: Filter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'awaiting_customer':
    case 'direct_settlement':
    case 'lend_mediation':
      return row.dispute_phase === f;
    case 'agreed':
      return row.dispute_phase === 'resolved' && AGREED.includes(row.dispute_outcome);
    case 'unresolved':
      return row.dispute_phase === 'resolved' && row.dispute_outcome === 'unresolved';
    case 'dismissed':
      return (
        row.dispute_phase === 'resolved' &&
        (row.dispute_outcome === 'dismissed' || row.dispute_outcome === null)
      );
  }
}

export default function AdminCases() {
  const t = useT();
  const { formatCurrency, formatDate, dir, locale } = useI18n();
  const { configured } = useSupabaseAuth();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState<boolean>(() => configured);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!configured) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rows = await listAllDamageCases().catch(() => []);
      if (cancelled) return;
      const [profiles, merchantRows, contracts] = await Promise.all([
        fetchProfilesByIds(rows.map((r) => r.customer_user_id)).catch(() => new Map()),
        fetchMerchantsByIds(rows.map((r) => r.merchant_id)).catch(() => []),
        fetchContractsByIds(rows.map((r) => r.contract_id)).catch(() => new Map()),
      ]);
      if (cancelled) return;
      const merchants = new Map(merchantRows.map((m) => [m.id, m]));
      setEntries(
        rows.map((row) => {
          const m = merchants.get(row.merchant_id);
          return {
            row,
            customerName: profiles.get(row.customer_user_id)?.full_name ?? '—',
            merchantName:
              m?.display_name?.[locale] ?? m?.display_name?.ar ?? m?.company_name ?? '—',
            contractNumber: contracts.get(row.contract_id)?.contract_number ?? null,
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, locale]);

  const filtered = useMemo(
    () => (entries ?? []).filter((e) => matchesFilter(e.row, filter)),
    [entries, filter],
  );
  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) {
      out[f] = (entries ?? []).filter((e) => matchesFilter(e.row, f)).length;
    }
    return out;
  }, [entries]);

  return (
    <>
      <Header title={t('admin.cases.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          {/* Filter chips — real states only. */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1" role="tablist">
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'h-9 px-4 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-navy-700 text-white'
                      : 'bg-white text-ink-700 ring-1 ring-beige-200',
                  )}
                >
                  {t(`admin.disputes.filters.${f}`)}{' '}
                  <span dir="ltr" className="num">
                    {counts[f] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <PageSkeleton rows={4} />
          ) : (entries ?? []).length === 0 ? (
            <EmptyState icon={<InfoIcon size={22} />} title={t('admin.cases.empty')} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('admin.disputes.emptyFiltered')}
            />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((e) => {
                const { row } = e;
                const needsAction = row.dispute_phase === 'lend_mediation';
                const latestAt = row.resolved_at ?? row.customer_response_at ?? row.raised_at;
                return (
                  <Link key={row.id} to={`/admin/cases/${row.id}`} className="block">
                    <Card padded className="space-y-2.5 transition-transform active:scale-[0.995]">
                      <div className="flex items-center gap-3">
                        <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-600 grid place-items-center">
                          <GavelIcon size={17} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                            {e.merchantName}
                            <span className="text-ink-400 font-normal"> · </span>
                            {e.customerName}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-ink-400 truncate num" dir="ltr">
                            {row.case_number}
                            {e.contractNumber ? ` · ${e.contractNumber}` : ''}
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
                          tone="neutral"
                          dot={false}
                          label={t(
                            `merchant.damages.severity.${row.severity === 'non_return' ? 'non-return' : row.severity}`,
                          )}
                        />
                        <StatusChip
                          size="sm"
                          tone={adminPhaseTone(row)}
                          dot
                          label={t(adminPhaseLabelKey(row))}
                        />
                        {needsAction && (
                          <StatusChip
                            size="sm"
                            tone="gold"
                            dot={false}
                            label={t('admin.disputes.needsAction')}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11.5px] text-ink-500">
                        <span className="num">{formatCurrency(Number(row.claim_amount))}</span>
                        <span className="num">{formatDate(latestAt)}</span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}
