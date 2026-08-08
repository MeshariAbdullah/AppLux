import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  ConfirmSheet,
  EmptyState,
  FormField,
  ImageLightbox,
  Input,
  SectionHeader,
  StatusChip,
  Textarea,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  ImageIcon,
  InfoIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { logEvent } from '@/lib/observability/log';
import { translateError, withSupportId } from '@/lib/errors';
import { useI18n, useT } from '@/lib/i18n';
import { useSensitiveFlow } from '@/lib/session/flowGuard';
import { useStore } from '@/lib/store';
import {
  fetchContractById,
  fetchDisputeCase,
  fetchProfile,
  getReceiptPhotoUrl,
  listContractReceiptPhotos,
  listDisputeEvents,
  listDisputeEvidence,
  listDisputeProposals,
  listInvoiceItems,
  respondToLendProposal,
  respondToSettlementProposal,
  submitSettlementProposal,
  useSupabaseAuth,
  type DamageCaseRow,
  type DisputeEventRow,
  type DisputeEvidenceItem,
  type DisputeProposalWithResponses,
  type RentalContractRow,
} from '@/lib/supabase';
import { disputePhaseLabelKey, disputePhaseTone } from './MerchantDamages';

// =====================================================================
// MerchantDamageDetails — /merchant/damages/:id
//
// Rebuilt around the Phase-1 dispute lifecycle (20260502124700). The
// page renders ONLY canonical server state — dispute_phase /
// dispute_outcome, real proposal + response rows, and the persisted
// dispute_events timeline. The legacy 4-step decoration ("تنفيذ عبر
// نافذ" / "محكمة التنفيذ"), the note DocLink, and every stage-driven
// label are gone from this surface. Neutral tone throughout: a claim
// is documented, not proven; Lend assists, it does not enforce.
// =====================================================================

type Bundle = {
  kase: DamageCaseRow;
  contract: RentalContractRow | null;
  customerName: string;
  itemName: string | null;
  proposals: DisputeProposalWithResponses[];
  events: DisputeEventRow[];
  evidence: DisputeEvidenceItem[];
  receiptUrls: string[];
};

const TIMELINE_STEPS = ['submitted', 'awaiting', 'direct', 'lend', 'outcome'] as const;
type TimelineStep = (typeof TIMELINE_STEPS)[number];
type StepState = 'done' | 'current' | 'pending' | 'skipped';

/** Map canonical phase/outcome (+ real events) onto the 5-step neutral
 *  journey. Steps the flow never entered render as skipped, never as
 *  completed — nothing is synthesized. */
function timelineStates(kase: DamageCaseRow, events: DisputeEventRow[]): Record<TimelineStep, StepState> {
  const has = (type: string) => events.some((e) => e.event_type === type);
  const out: Record<TimelineStep, StepState> = {
    submitted: 'done',
    awaiting: 'pending',
    direct: 'pending',
    lend: 'pending',
    outcome: 'pending',
  };
  switch (kase.dispute_phase) {
    case 'awaiting_customer':
      out.awaiting = 'current';
      break;
    case 'direct_settlement':
      out.awaiting = 'done';
      out.direct = 'current';
      break;
    case 'lend_mediation':
      out.awaiting = 'done';
      out.direct = 'done';
      out.lend = 'current';
      break;
    case 'resolved':
      out.awaiting = 'done';
      // Only mark stages the case actually passed through.
      out.direct = has('customer_objected') ? 'done' : 'skipped';
      out.lend = has('moved_to_lend_mediation') ? 'done' : 'skipped';
      out.outcome = 'done';
      break;
  }
  return out;
}

export default function MerchantDamageDetails() {
  const t = useT();
  const { formatCurrency, formatDate, dir } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantDamages } = useStore();
  const { configured } = useSupabaseAuth();

  const demoCase = merchantDamages.find((d) => d.id === id) ?? null;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [resolving, setResolving] = useState<boolean>(() =>
    Boolean(configured && id),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSensitiveFlow(busy);

  const load = useCallback(async (): Promise<Bundle | null> => {
    if (!configured || !id) return null;
    const kase = await fetchDisputeCase(id).catch(() => null);
    if (!kase) return null;
    const [contract, customer, proposals, events, evidence] = await Promise.all([
      fetchContractById(kase.contract_id).catch(() => null),
      fetchProfile(kase.customer_user_id).catch(() => null),
      listDisputeProposals(kase.id).catch(() => []),
      listDisputeEvents(kase.id).catch(() => []),
      listDisputeEvidence(kase.id).catch(() => []),
    ]);
    let itemName: string | null = null;
    let receiptUrls: string[] = [];
    if (contract) {
      const [items, photos] = await Promise.all([
        listInvoiceItems(contract.invoice_id).catch(() => []),
        // Merchant read on the customer's receipt photos is granted by
        // the receipts storage/table policies (20260502122900).
        listContractReceiptPhotos(contract.id).catch(() => []),
      ]);
      itemName = items[0]?.item_name ?? null;
      receiptUrls = (
        await Promise.all(photos.map((p) => getReceiptPhotoUrl(p.storage_path)))
      ).filter((u): u is string => Boolean(u));
    }
    return {
      kase,
      contract,
      customerName: customer?.full_name ?? '—',
      itemName,
      proposals,
      events,
      evidence,
      receiptUrls,
    };
  }, [configured, id]);

  const refetch = useCallback(async () => {
    const next = await load();
    setBundle(next);
  }, [load]);

  useEffect(() => {
    if (!configured || !id) {
      setBundle(null);
      setResolving(false);
      return;
    }
    let cancelled = false;
    setBundle(null);
    setResolving(true);
    load()
      .then((b) => {
        if (!cancelled) setBundle(b);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, id, load]);

  const runAction = async (op: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === 'P0201' || code === 'P0203' || code === 'P0205' || code === 'P0208') {
        await refetch().catch(() => {});
      }
      const eventId = logEvent('dispute_action_failed', 'warn', { op }, err);
      setActionError(withSupportId(translateError(err, t), eventId));
    } finally {
      setBusy(false);
    }
  };

  // ----------------- loading / not found / demo -----------------------
  if (!bundle) {
    if (resolving) {
      return (
        <>
          <Header title={t('merchant.damageCase.eyebrow')} showBack />
          <Screen className="bg-canvas">
            <div className="min-h-[40vh] grid place-items-center">
              <span className="h-7 w-7 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
            </div>
          </Screen>
        </>
      );
    }
    if (configured || !demoCase) {
      return (
        <>
          <Header title={t('merchant.damageCase.eyebrow')} showBack />
          <Screen className="bg-canvas">
            <EmptyState
              tone="warn"
              icon={<AlertIcon size={22} />}
              title={t('merchant.damageCase.notFound.title')}
              description={t('merchant.damageCase.notFound.body')}
              action={
                <Button
                  size="sm"
                  onClick={() => navigate('/merchant/damages', { replace: true })}
                >
                  {t('merchant.damageCase.notFound.back')}
                </Button>
              }
            />
          </Screen>
        </>
      );
    }
    // Demo build only: a minimal, action-free neutral summary.
    return (
      <>
        <Header title={demoCase.id} subtitle={demoCase.customerName} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-5 pt-5 pb-10 space-y-4">
            <Card padded className="space-y-2.5">
              <FactRow label={t('disputes.claim.type')} value={t(`merchant.damages.severity.${demoCase.severity}`)} />
              <FactRow label={t('disputes.claim.amount')} value={<span className="num">{formatCurrency(demoCase.claimAmount)}</span>} />
              <FactRow label={t('disputes.claim.raisedAt')} value={<span className="num">{formatDate(demoCase.reportedAt)}</span>} />
              {demoCase.notes && (
                <p className="text-[12.5px] text-ink-600 leading-relaxed">{demoCase.notes}</p>
              )}
            </Card>
          </div>
        </Screen>
      </>
    );
  }

  const { kase, contract, customerName, itemName, proposals, events, evidence, receiptUrls } = bundle;
  const merchantEvidence = evidence.filter((e) => e.row.uploaded_by_user_id !== kase.customer_user_id);
  const customerEvidence = evidence.filter((e) => e.row.uploaded_by_user_id === kase.customer_user_id);
  const directProposals = proposals.filter((p) => p.kind === 'direct');
  const lendProposal = proposals.find((p) => p.kind === 'lend') ?? null;
  const pendingDirect = directProposals.find((p) => p.status === 'pending') ?? null;
  const usedRounds = directProposals.length;
  const steps = timelineStates(kase, events);
  const sevKey = kase.severity === 'non_return' ? 'non-return' : kase.severity;

  return (
    <>
      <Header title={kase.case_number} subtitle={customerName} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          {/* ---------- hero ---------- */}
          <Card padded className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-700 grid place-items-center">
                <ShieldIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] text-ink-400 uppercase tracking-[0.08em]">
                  {t('merchant.damageCase.eyebrow')}
                </div>
                <div className="mt-0.5 text-[16px] font-bold text-ink-900 num" dir="ltr">
                  {kase.case_number}
                </div>
              </div>
              <StatusChip
                tone={disputePhaseTone(kase)}
                dot
                label={t(disputePhaseLabelKey(kase))}
              />
            </div>
          </Card>

          {actionError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
              {actionError}
            </div>
          )}

          {/* ---------- neutral 5-step timeline ---------- */}
          <Card padded className="space-y-3">
            <SectionHeader title={t('merchant.disputes.timeline.title')} className="mb-0" />
            <ol className="space-y-0">
              {TIMELINE_STEPS.map((key, i) => {
                const st = steps[key];
                if (st === 'skipped') return null;
                const last = i === TIMELINE_STEPS.length - 1;
                return (
                  <li key={key} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'h-7 w-7 rounded-full grid place-items-center shrink-0 ring-2',
                          st === 'done'
                            ? 'bg-success-500 text-white ring-success-500/25'
                            : st === 'current'
                              ? 'bg-gold-400 text-ink-950 ring-gold-100'
                              : 'bg-canvas-100 text-ink-400 ring-canvas-200',
                        )}
                      >
                        {st === 'done' ? <BadgeCheckIcon size={13} /> : <ClockIcon size={13} />}
                      </span>
                      {!last && <span className="w-[2px] h-5 bg-canvas-200" />}
                    </div>
                    <div
                      className={cn(
                        'pt-1 text-[12.5px]',
                        st === 'current' ? 'font-bold text-ink-900' : st === 'done' ? 'font-semibold text-ink-700' : 'text-ink-400',
                      )}
                    >
                      {key === 'outcome' && kase.dispute_phase === 'resolved'
                        ? t(disputePhaseLabelKey(kase))
                        : t(`merchant.disputes.timeline.${key}`)}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          {/* ---------- claim facts ---------- */}
          <Card padded className="space-y-3">
            <SectionHeader title={t('disputes.claim.title')} className="mb-0" />
            <FactRow label={t('disputes.claim.type')} value={t(`merchant.damages.severity.${sevKey}`)} />
            <FactRow
              label={t('merchant.damageCase.linkedRental')}
              value={
                contract ? (
                  <Link to={`/merchant/rentals/${contract.id}`} className="text-lavender-700 num" dir="ltr">
                    {contract.contract_number}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <FactRow
              label={t('merchant.disputes.customerLabel')}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={12} className="text-ink-400" />
                  {customerName}
                </span>
              }
            />
            {itemName && <FactRow label={t('disputes.claim.item')} value={itemName} />}
            <FactRow
              label={t('disputes.claim.amount')}
              value={<span className="num">{formatCurrency(Number(kase.claim_amount))}</span>}
            />
            <FactRow
              label={t('disputes.claim.raisedAt')}
              value={<span className="num">{formatDate(kase.raised_at)}</span>}
            />
            {kase.description && (
              <>
                <CardDivider />
                <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                  {kase.description}
                </p>
              </>
            )}
          </Card>

          {/* ---------- evidence ---------- */}
          <EvidenceCard
            title={t('merchant.damageCase.evidence')}
            items={merchantEvidence}
            emptyLabel={t('disputes.evidence.none')}
            unavailableLabel={t('disputes.evidence.imageUnavailable')}
          />
          {customerEvidence.length > 0 && (
            <EvidenceCard
              title={t('merchant.disputes.customerEvidenceTitle')}
              items={customerEvidence}
              emptyLabel={t('disputes.evidence.none')}
              unavailableLabel={t('disputes.evidence.imageUnavailable')}
            />
          )}
          {receiptUrls.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('merchant.disputes.receiptTitle')} className="mb-0" />
              <p className="text-[11.5px] text-ink-500">{t('merchant.disputes.receiptHint')}</p>
              <PhotoGrid urls={receiptUrls} />
            </Card>
          )}

          {/* ---------- customer objection ---------- */}
          {kase.customer_objection_reason && (
            <Card padded className="space-y-2">
              <SectionHeader
                title={t('merchant.disputes.objection.title')}
                className="mb-0"
                action={
                  kase.customer_response_at ? (
                    <span className="text-[11px] text-ink-400 num">
                      {formatDate(kase.customer_response_at)}
                    </span>
                  ) : undefined
                }
              />
              <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                {kase.customer_objection_reason}
              </p>
            </Card>
          )}

          {/* ---------- phase panels ---------- */}
          {kase.dispute_phase === 'awaiting_customer' && (
            <Card padded className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <ClockIcon size={16} className="text-gold-600 shrink-0" />
                <div className="text-[13.5px] font-semibold text-ink-900">
                  {t('merchant.disputes.await.title')}
                </div>
              </div>
              <p className="text-[12.5px] text-ink-600 leading-relaxed">
                {t('merchant.disputes.await.body')}
              </p>
            </Card>
          )}

          {kase.dispute_phase === 'direct_settlement' && (
            <DirectSettlementPanel
              t={t}
              busy={busy}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              directProposals={directProposals}
              pendingDirect={pendingDirect}
              usedRounds={usedRounds}
              onSubmit={(amount, note) =>
                runAction('submit_settlement_proposal', async () => {
                  await submitSettlementProposal(kase.id, amount, note || undefined);
                })
              }
              onRespond={(proposalId, accept) =>
                runAction('respond_to_settlement_proposal', () =>
                  respondToSettlementProposal(proposalId, accept),
                )
              }
            />
          )}

          {kase.dispute_phase === 'lend_mediation' && (
            <LendPanel
              t={t}
              busy={busy}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              lendProposal={lendProposal}
              onRespond={(accept) =>
                runAction('respond_to_lend_proposal', () =>
                  respondToLendProposal(kase.id, accept),
                )
              }
            />
          )}

          {kase.dispute_phase === 'resolved' && (
            <ResolvedPanel
              t={t}
              kase={kase}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
            />
          )}

          {/* Past proposals stay visible after direct settlement. */}
          {kase.dispute_phase !== 'direct_settlement' && directProposals.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('disputes.settlement.title')} className="mb-0" />
              {directProposals.map((p) => (
                <ProposalCard key={p.id} t={t} p={p} formatCurrency={formatCurrency} formatDate={formatDate} />
              ))}
            </Card>
          )}

          {/* ---------- persisted event log ---------- */}
          {events.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('merchant.disputes.events.title')} className="mb-0" />
              <div className="space-y-2.5">
                {[...events].reverse().map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-canvas-300" />
                    <div className="min-w-0 flex-1 flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="text-ink-700">
                        {t(`merchant.disputes.events.${e.event_type}`)}
                      </span>
                      <span className="text-ink-400 num shrink-0">{formatDate(e.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </Screen>
    </>
  );
}

// =====================================================================
// Sub-components (merchant perspective)
// =====================================================================

function FactRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-ink-400 shrink-0">{label}</span>
      <span className="font-semibold text-ink-900 text-end min-w-0 truncate">{value}</span>
    </div>
  );
}

function PhotoGrid({ urls }: { urls: string[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {urls.map((u, i) => (
          <button
            key={`${i}-${u.slice(-12)}`}
            type="button"
            onClick={() => setLightbox(i)}
            className="relative aspect-square overflow-hidden rounded-xl bg-canvas-200 hairline active:scale-[0.98] transition-transform"
          >
            <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <ImageLightbox
        open={lightbox !== null}
        images={urls}
        startIndex={lightbox ?? 0}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}

function EvidenceCard({
  title,
  items,
  emptyLabel,
  unavailableLabel,
}: {
  title: ReactNode;
  items: DisputeEvidenceItem[];
  emptyLabel: ReactNode;
  unavailableLabel: ReactNode;
}) {
  const urls = items.map((e) => e.url).filter((u): u is string => Boolean(u));
  const missing = items.length - urls.length;
  return (
    <Card padded className="space-y-2.5">
      <SectionHeader
        title={title}
        className="mb-0"
        action={
          <span className="text-[11px] font-semibold num rounded-full px-2 py-0.5 bg-canvas-200 text-ink-500">
            {items.length}
          </span>
        }
      />
      {items.length === 0 ? (
        <div className="rounded-xl2 bg-canvas-100 hairline p-3 flex items-center gap-2.5 text-[12px] text-ink-500">
          <ImageIcon size={15} className="shrink-0 text-ink-400" />
          {emptyLabel}
        </div>
      ) : (
        <>
          <PhotoGrid urls={urls} />
          {missing > 0 && <div className="text-[11px] text-ink-400">{unavailableLabel}</div>}
        </>
      )}
    </Card>
  );
}

/** Merchant-relative "from" labels: my offer vs the renter's offer. */
function ProposalCard({
  t,
  p,
  formatCurrency,
  formatDate,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  p: DisputeProposalWithResponses;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
}) {
  const statusTone: StatusTone =
    p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'neutral' : 'warn';
  return (
    <div className="rounded-xl2 bg-canvas-100 hairline p-3.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-ink-900">
          {t(`merchant.disputes.proposalFrom.${p.proposed_by_party}`)}
          {p.kind === 'direct' && p.round != null && (
            <span className="text-ink-400 font-normal">
              {' · '}
              {t('disputes.settlement.round', { current: p.round, total: 2 })}
            </span>
          )}
        </span>
        <StatusChip size="sm" tone={statusTone} dot={false} label={t(`disputes.settlement.status.${p.status}`)} />
      </div>
      <div className="text-[15px] font-bold text-ink-900 num">{formatCurrency(Number(p.amount))}</div>
      {p.note && <p className="text-[12px] text-ink-600 leading-relaxed">{p.note}</p>}
      <div className="text-[11px] text-ink-400 num">{formatDate(p.created_at)}</div>
    </div>
  );
}

function DirectSettlementPanel({
  t,
  busy,
  formatCurrency,
  formatDate,
  directProposals,
  pendingDirect,
  usedRounds,
  onSubmit,
  onRespond,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  directProposals: DisputeProposalWithResponses[];
  pendingDirect: DisputeProposalWithResponses | null;
  usedRounds: number;
  onSubmit: (amount: number, note: string) => void;
  onRespond: (proposalId: string, accept: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const pendingFromCustomer = pendingDirect?.proposed_by_party === 'customer';
  const pendingFromMe = pendingDirect?.proposed_by_party === 'merchant';
  const canSubmit = !pendingDirect && usedRounds < 2;
  const currentRound = Math.min(usedRounds + (pendingDirect ? 0 : 1), 2);
  const amountValue = Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue >= 0 && amount.trim() !== '';

  return (
    <Card padded className="space-y-3.5">
      <SectionHeader title={t('disputes.settlement.title')} className="mb-0" />
      <div className="rounded-xl2 bg-lavender-50 ring-1 ring-lavender-200 px-3.5 py-2.5 text-[12px] text-lavender-800 leading-relaxed flex items-start gap-2">
        <InfoIcon size={14} className="shrink-0 mt-0.5" />
        {t('disputes.settlement.roundsNotice')}
      </div>
      <div className="text-[11.5px] font-semibold text-ink-500 num">
        {t('disputes.settlement.round', { current: currentRound, total: 2 })}
      </div>

      {directProposals.map((p) => (
        <ProposalCard key={p.id} t={t} p={p} formatCurrency={formatCurrency} formatDate={formatDate} />
      ))}

      {pendingFromCustomer && pendingDirect && (
        <div className="space-y-2.5">
          <Button size="lg" block loading={busy} disabled={busy} onClick={() => onRespond(pendingDirect.id, true)}>
            {t('disputes.settlement.accept')}
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
            className="flex items-center justify-center h-12 w-full rounded-xl2 bg-white text-ink-800 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-canvas-300 hover:bg-canvas-50 transition-colors"
          >
            {t('disputes.settlement.reject')}
          </button>
          {pendingDirect.round === 1 && (
            <p className="text-[11.5px] text-ink-400">{t('disputes.settlement.counterHint')}</p>
          )}
          <ConfirmSheet
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            onConfirm={() => {
              setRejectOpen(false);
              onRespond(pendingDirect.id, false);
            }}
            title={t('disputes.settlement.rejectSheet.title')}
            description={
              pendingDirect.round === 2
                ? t('disputes.settlement.rejectSheet.bodyFinalRound')
                : t('disputes.settlement.rejectSheet.body')
            }
            confirmLabel={t('disputes.settlement.rejectSheet.confirm')}
            cancelLabel={t('disputes.settlement.rejectSheet.cancel')}
            icon={<GavelIcon size={18} />}
            tone="warn"
          />
        </div>
      )}

      {pendingFromMe && (
        <div className="rounded-xl2 bg-canvas-100 hairline px-3.5 py-2.5 text-[12px] text-ink-500 flex items-center gap-2">
          <ClockIcon size={14} className="shrink-0 text-ink-400" />
          {t('disputes.settlement.waitingOther')}
        </div>
      )}

      {canSubmit && (
        <div className="space-y-3 pt-1">
          <div className="text-[13px] font-semibold text-ink-900">
            {t('disputes.settlement.submitTitle')}
          </div>
          <FormField label={t('disputes.settlement.amountLabel')} required>
            <Input
              inputMode="decimal"
              dir="ltr"
              className="num text-left"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </FormField>
          <FormField label={t('disputes.settlement.noteLabel')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </FormField>
          <Button
            size="lg"
            block
            loading={busy}
            disabled={busy || !amountValid}
            onClick={() => onSubmit(amountValue, note.trim())}
          >
            {t('disputes.settlement.submit')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function LendPanel({
  t,
  busy,
  formatCurrency,
  formatDate,
  lendProposal,
  onRespond,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  lendProposal: DisputeProposalWithResponses | null;
  onRespond: (accept: boolean) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const myResponse =
    lendProposal?.dispute_proposal_responses.find((r) => r.party === 'merchant') ?? null;
  const customerResponse =
    lendProposal?.dispute_proposal_responses.find((r) => r.party === 'customer') ?? null;

  return (
    <Card padded className="space-y-3.5">
      <SectionHeader title={t('disputes.lend.title')} className="mb-0" />
      <p className="text-[12.5px] text-ink-600 leading-relaxed">{t('disputes.lend.body')}</p>

      {!lendProposal && (
        <div className="rounded-xl2 bg-canvas-100 hairline px-3.5 py-3 text-[12.5px] text-ink-500 flex items-center gap-2.5">
          <ClockIcon size={15} className="shrink-0 text-ink-400" />
          {t('disputes.lend.waiting')}
        </div>
      )}

      {lendProposal && (
        <div className="space-y-3">
          <div className="rounded-xl2 bg-lavender-50 ring-1 ring-lavender-200 p-3.5 space-y-1.5">
            <div className="text-[12.5px] font-semibold text-lavender-800">
              {t('disputes.lend.proposalTitle')}
            </div>
            <div className="text-[16px] font-bold text-ink-900 num">
              {formatCurrency(Number(lendProposal.amount))}
            </div>
            {lendProposal.note && (
              <p className="text-[12px] text-ink-600 leading-relaxed">{lendProposal.note}</p>
            )}
            <div className="text-[11px] text-ink-400 num">
              {t('disputes.lend.proposedAt')} · {formatDate(lendProposal.created_at)}
            </div>
          </div>

          {customerResponse && (
            <div className="rounded-xl2 bg-canvas-100 hairline px-3.5 py-2 text-[12px] text-ink-600">
              {t(
                `merchant.disputes.customerResponse.${customerResponse.accepted ? 'accepted' : 'rejected'}`,
              )}
            </div>
          )}

          {myResponse ? (
            <div className="rounded-xl2 bg-canvas-100 hairline px-3.5 py-2.5 text-[12.5px] text-ink-700 space-y-1">
              <div className="font-semibold">
                {t(`disputes.lend.yourResponse.${myResponse.accepted ? 'accepted' : 'rejected'}`)}
              </div>
              <div className="text-ink-500">{t('disputes.lend.waitingOther')}</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <Button size="lg" block loading={busy} disabled={busy} onClick={() => onRespond(true)}>
                {t('disputes.lend.accept')}
              </Button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
                className="flex items-center justify-center h-12 w-full rounded-xl2 bg-white text-ink-800 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-canvas-300 hover:bg-canvas-50 transition-colors"
              >
                {t('disputes.lend.reject')}
              </button>
              <ConfirmSheet
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onConfirm={() => {
                  setRejectOpen(false);
                  onRespond(false);
                }}
                title={t('disputes.lend.rejectSheet.title')}
                description={t('disputes.lend.rejectSheet.body')}
                confirmLabel={t('disputes.lend.rejectSheet.confirm')}
                cancelLabel={t('disputes.lend.rejectSheet.cancel')}
                icon={<GavelIcon size={18} />}
                tone="warn"
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ResolvedPanel({
  t,
  kase,
  formatCurrency,
  formatDate,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  kase: DamageCaseRow;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
}) {
  const outcome = kase.dispute_outcome ?? 'unresolved';
  const isAgreement =
    outcome === 'claim_accepted' || outcome === 'direct_settlement' || outcome === 'lend_settlement';
  const amount = formatCurrency(Number(kase.agreed_amount ?? kase.claim_amount));
  return (
    <Card padded className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'h-11 w-11 shrink-0 rounded-2xl grid place-items-center ring-1',
            isAgreement
              ? 'bg-success-50 text-success-600 ring-success-500/20'
              : 'bg-canvas-100 text-ink-500 ring-canvas-200',
          )}
        >
          {isAgreement ? <BadgeCheckIcon size={20} /> : <InfoIcon size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink-900">
            {t(`merchant.disputes.outcome.${outcome}`)}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-600 leading-relaxed">
            {t(`merchant.disputes.terminal.${outcome}`, { amount })}
          </p>
        </div>
      </div>
      <CardDivider />
      <div className="space-y-2">
        {isAgreement && kase.agreed_amount != null && (
          <FactRow
            label={t('disputes.resolved.agreedAmount')}
            value={<span className="num">{formatCurrency(Number(kase.agreed_amount))}</span>}
          />
        )}
        {kase.customer_response_at && outcome === 'claim_accepted' && (
          <FactRow
            label={t('merchant.disputes.acceptedAt')}
            value={<span className="num">{formatDate(kase.customer_response_at)}</span>}
          />
        )}
        {kase.resolved_at && (
          <FactRow
            label={t('disputes.resolved.resolvedAt')}
            value={<span className="num">{formatDate(kase.resolved_at)}</span>}
          />
        )}
      </div>
    </Card>
  );
}
