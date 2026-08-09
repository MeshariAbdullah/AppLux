import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Card, EmptyState, PageSkeleton, StatusChip, type StatusTone } from '@/components/ui';
import { ChevronIcon, InfoIcon, ShieldIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { requireSupabase } from '@/lib/supabase/client';
import {
  fetchContractsByIds,
  fetchMerchantsByIds,
  useSupabaseAuth,
  type DamageCaseRow,
  type DisputeProposalWithResponses,
} from '@/lib/supabase';

// =====================================================================
// /disputes — the customer's dispute cases. LIVE + DB-backed only
// (RLS scopes damage_cases to the signed-in customer). Canonical
// dispute_phase / dispute_outcome drive everything; "action needed"
// derives from real pending proposal rows, never guesses. Each card
// deep-links the exact case UUID.
// =====================================================================

type Entry = {
  row: DamageCaseRow;
  merchantName: string;
  contractNumber: string | null;
  actionNeeded: boolean;
};

type Filter = 'all' | 'action' | 'settling' | 'lend' | 'finished';
const FILTERS: Filter[] = ['all', 'action', 'settling', 'lend', 'finished'];

function phaseTone(row: DamageCaseRow): StatusTone {
  if (row.dispute_phase === 'resolved') {
    return row.dispute_outcome === 'unresolved' || row.dispute_outcome === 'dismissed'
      ? 'neutral'
      : 'success';
  }
  if (row.dispute_phase === 'awaiting_customer') return 'warn';
  return 'brand';
}

function phaseLabelKey(row: DamageCaseRow): string {
  if (row.dispute_phase === 'resolved') {
    return `disputes.resolved.${row.dispute_outcome ?? 'dismissed'}.title`;
  }
  return `disputes.phase.${row.dispute_phase}`;
}

export default function MyDisputes() {
  const t = useT();
  const { formatCurrency, formatDate, dir, locale } = useI18n();
  const { configured, session } = useSupabaseAuth();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(configured && session?.user?.id),
  );
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!configured || !session?.user?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const sb = requireSupabase();
      // RLS already scopes to the signed-in customer.
      const { data: rows } = await sb
        .from('damage_cases')
        .select('*')
        .order('raised_at', { ascending: false });
      if (cancelled) return;
      const cases = (rows ?? []) as DamageCaseRow[];
      const [merchants, contracts, pendingRes] = await Promise.all([
        fetchMerchantsByIds(cases.map((r) => r.merchant_id)).catch(() => []),
        fetchContractsByIds(cases.map((r) => r.contract_id)).catch(() => new Map()),
        cases.length
          ? sb
              .from('dispute_settlement_proposals')
              .select('*, dispute_proposal_responses(*)')
              .in('case_id', cases.map((r) => r.id))
              .eq('status', 'pending')
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const merchantMap = new Map(merchants.map((m) => [m.id, m]));
      const pending = ((pendingRes.data ?? []) as DisputeProposalWithResponses[]);
      const actionable = (row: DamageCaseRow): boolean => {
        if (row.dispute_phase === 'awaiting_customer') return true;
        const p = pending.find((x) => x.case_id === row.id);
        if (!p) return false;
        if (p.kind === 'direct') return p.proposed_by_party === 'merchant';
        // lend proposal actionable until the customer responded
        return !p.dispute_proposal_responses.some((r) => r.party === 'customer');
      };
      setEntries(
        cases.map((row) => {
          const m = merchantMap.get(row.merchant_id);
          return {
            row,
            merchantName:
              m?.display_name?.[locale] ?? m?.display_name?.ar ?? m?.company_name ?? '—',
            contractNumber: contracts.get(row.contract_id)?.contract_number ?? null,
            actionNeeded: row.dispute_phase !== 'resolved' && actionable(row),
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, session?.user?.id, locale]);

  const matches = (e: Entry, f: Filter): boolean => {
    switch (f) {
      case 'all':
        return true;
      case 'action':
        return e.actionNeeded;
      case 'settling':
        return e.row.dispute_phase === 'direct_settlement';
      case 'lend':
        return e.row.dispute_phase === 'lend_mediation';
      case 'finished':
        return e.row.dispute_phase === 'resolved';
    }
  };
  const filtered = useMemo(
    () => (entries ?? []).filter((e) => matches(e, filter)),
    [entries, filter],
  );
  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f] = (entries ?? []).filter((e) => matches(e, f)).length;
    return out;
  }, [entries]);

  return (
    <>
      <Header title={t('disputes.list.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
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
                  {t(`disputes.list.filters.${f}`)}{' '}
                  <span dir="ltr" className="num">
                    {counts[f] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <PageSkeleton rows={3} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('disputes.list.empty')}
              description={t('disputes.list.emptyHint')}
            />
          ) : (
            <div className="space-y-2.5">
              {filtered.map((e) => (
                <Link key={e.row.id} to={`/disputes/${e.row.id}`} className="block">
                  <Card padded className="space-y-2.5 transition-transform active:scale-[0.995]">
                    <div className="flex items-center gap-3">
                      <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-600 grid place-items-center">
                        <ShieldIcon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                          {e.merchantName}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-400 truncate num" dir="ltr">
                          {e.row.case_number}
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
                        label={t(`disputes.claim.types.${e.row.severity}`)}
                      />
                      <StatusChip
                        size="sm"
                        tone={phaseTone(e.row)}
                        dot
                        label={t(phaseLabelKey(e.row))}
                      />
                      {e.actionNeeded && (
                        <StatusChip
                          size="sm"
                          tone="gold"
                          dot={false}
                          label={t('disputes.list.actionNeeded')}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11.5px] text-ink-500">
                      <span className="num">{formatCurrency(Number(e.row.claim_amount))}</span>
                      <span className="num">
                        {formatDate(e.row.resolved_at ?? e.row.customer_response_at ?? e.row.raised_at)}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}
