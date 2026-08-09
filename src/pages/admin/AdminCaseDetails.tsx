import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
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
  GavelIcon,
  ImageIcon,
  InfoIcon,
  ShieldIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { logEvent } from '@/lib/observability/log';
import { translateError, withSupportId } from '@/lib/errors';
import { useI18n, useT } from '@/lib/i18n';
import {
  adminDismissDisputeCase,
  fetchContractById,
  fetchDisputeCase,
  fetchMerchant,
  fetchProfile,
  getReceiptPhotoUrl,
  lendSubmitMediationProposal,
  listContractReceiptPhotos,
  listDisputeEvents,
  listDisputeEvidence,
  listDisputeProposals,
  listInvoiceItems,
  useSupabaseAuth,
  type DamageCaseRow,
  type DisputeEventRow,
  type DisputeEvidenceItem,
  type DisputeProposalWithResponses,
  type MerchantRow,
  type RentalContractRow,
} from '@/lib/supabase';
import { adminPhaseLabelKey, adminPhaseTone } from './AdminCases';
import { exportDisputeFilePdf } from '@/lib/pdf/disputeFilePdf';

// =====================================================================
// AdminCaseDetails — /admin/cases/:id (canonical case UUID).
//
// Fully LIVE replacement for the legacy demo-only page (which read the
// seed store, always rendered not-found in production, and simulated
// "escalation" through review/settlement/nafith/execution stages in
// localStorage). Lend's role here is a NEUTRAL MEDIATOR: the only
// action is the single lend_submit_mediation_proposal RPC, available
// exactly while dispute_phase = lend_mediation and no proposal exists.
// No forced settle, no liability marking, no phase overrides, no
// legacy legal wording. Everything renders from canonical
// dispute_phase / dispute_outcome, real proposals + per-party
// responses, and persisted dispute_events.
//
// Backward compatibility: the old /admin/cases/:kind/:id links redirect
// here (see routes.tsx) — the legacy `:kind` segment carried no data.
// =====================================================================

type Bundle = {
  kase: DamageCaseRow;
  contract: RentalContractRow | null;
  merchant: MerchantRow | null;
  customerName: string;
  itemName: string | null;
  proposals: DisputeProposalWithResponses[];
  events: DisputeEventRow[];
  evidence: DisputeEvidenceItem[];
  receiptUrls: string[];
};

export default function AdminCaseDetails() {
  const t = useT();
  const { formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const { configured } = useSupabaseAuth();

  // Canonical route: /admin/cases/:id. Legacy route: /admin/cases/:kind/:id
  // (kind was 'damage' | 'overdue' — meaningless). When both params are
  // present we redirect to the canonical URL, preserving the UUID.
  const legacyKind = params.kind;
  const id = params.id;
  if (legacyKind && id) {
    return <Navigate to={`/admin/cases/${id}`} replace />;
  }

  return <AdminCaseDetailsInner key={id} id={id ?? null} configured={configured} t={t}
    formatCurrency={formatCurrency} formatDate={formatDate} locale={locale} navigate={navigate} />;
}

function AdminCaseDetailsInner({
  id,
  configured,
  t,
  formatCurrency,
  formatDate,
  locale,
  navigate,
}: {
  id: string | null;
  configured: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  locale: 'ar' | 'en';
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [resolving, setResolving] = useState<boolean>(() => Boolean(configured && id));
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<Bundle | null> => {
    if (!configured || !id) return null;
    const kase = await fetchDisputeCase(id).catch(() => null);
    if (!kase) return null;
    const [contract, merchant, customer, proposals, events, evidence] = await Promise.all([
      fetchContractById(kase.contract_id).catch(() => null),
      fetchMerchant(kase.merchant_id).catch(() => null),
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
      merchant,
      customerName: customer?.full_name ?? '—',
      itemName,
      proposals,
      events,
      evidence,
      receiptUrls,
    };
  }, [configured, id]);

  const refetch = useCallback(async () => {
    setBundle(await load());
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

  if (!bundle) {
    if (resolving) {
      return (
        <>
          <Header title={t('admin.cases.title')} showBack />
          <Screen className="bg-canvas">
            <div className="min-h-[40vh] grid place-items-center">
              <span className="h-7 w-7 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
            </div>
          </Screen>
        </>
      );
    }
    return (
      <>
        <Header title={t('admin.cases.title')} showBack />
        <Screen className="bg-canvas">
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('admin.disputes.notFound.title')}
            description={t('admin.disputes.notFound.body')}
            action={
              <Button size="sm" onClick={() => navigate('/admin/cases', { replace: true })}>
                {t('admin.disputes.notFound.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const { kase, contract, merchant, customerName, itemName, proposals, events, evidence, receiptUrls } = bundle;
  const merchantName =
    merchant?.display_name?.[locale] ?? merchant?.display_name?.ar ?? merchant?.company_name ?? '—';
  const merchantEvidence = evidence.filter((e) => e.row.uploaded_by_user_id !== kase.customer_user_id);
  const customerEvidence = evidence.filter((e) => e.row.uploaded_by_user_id === kase.customer_user_id);
  const directProposals = proposals.filter((p) => p.kind === 'direct');
  const lendProposal = proposals.find((p) => p.kind === 'lend') ?? null;
  const sevKey = kase.severity === 'non_return' ? 'non-return' : kase.severity;

  const runAction = async (op: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === 'P0201' || code === 'P0207') await refetch().catch(() => {});
      const eventId = logEvent('dispute_action_failed', 'warn', { op }, err);
      setActionError(withSupportId(translateError(err, t), eventId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title={kase.case_number} subtitle={merchantName} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          {/* hero */}
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
              <StatusChip tone={adminPhaseTone(kase)} dot label={t(adminPhaseLabelKey(kase))} />
            </div>
          </Card>

          {actionError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
              {actionError}
            </div>
          )}

          {/* claim + contract + parties */}
          <Card padded className="space-y-3">
            <SectionHeader title={t('disputes.claim.title')} className="mb-0" />
            <FactRow label={t('disputes.claim.type')} value={t(`merchant.damages.severity.${sevKey}`)} />
            <FactRow label={t('admin.disputes.merchantLabel')} value={merchantName} />
            <FactRow label={t('admin.disputes.customerLabel')} value={customerName} />
            <FactRow
              label={t('admin.disputes.contractLabel')}
              value={<span className="num" dir="ltr">{contract?.contract_number ?? '—'}</span>}
            />
            {itemName && <FactRow label={t('admin.disputes.itemLabel')} value={itemName} />}
            {contract && (
              <>
                <FactRow
                  label={t('admin.disputes.periodLabel')}
                  value={
                    <span className="num" dir="ltr">
                      {formatDate(contract.start_date)} → {formatDate(contract.end_date)}
                    </span>
                  }
                />
                <FactRow
                  label={t('admin.disputes.itemValueLabel')}
                  value={<span className="num">{formatCurrency(Number(contract.original_item_value))}</span>}
                />
                <FactRow
                  label={t('admin.disputes.contractStateLabel')}
                  value={contract.status}
                />
              </>
            )}
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

          {/* customer response */}
          {kase.customer_response_at && (
            <Card padded className="space-y-2">
              <SectionHeader
                title={t('admin.disputes.customerResponseTitle')}
                className="mb-0"
                action={
                  <span className="text-[11px] text-ink-400 num">
                    {formatDate(kase.customer_response_at)}
                  </span>
                }
              />
              <div className="text-[13px] font-semibold text-ink-900">
                {kase.customer_objection_reason
                  ? t('admin.disputes.objected')
                  : t('admin.disputes.accepted')}
              </div>
              {kase.customer_objection_reason && (
                <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                  {kase.customer_objection_reason}
                </p>
              )}
            </Card>
          )}

          {/* evidence */}
          <EvidenceCard
            title={t('merchant.damageCase.evidence')}
            items={merchantEvidence}
            emptyLabel={t('disputes.evidence.none')}
          />
          {customerEvidence.length > 0 && (
            <EvidenceCard
              title={t('merchant.disputes.customerEvidenceTitle')}
              items={customerEvidence}
              emptyLabel={t('disputes.evidence.none')}
            />
          )}
          {receiptUrls.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('merchant.disputes.receiptTitle')} className="mb-0" />
              <PhotoGrid urls={receiptUrls} />
            </Card>
          )}

          {/* direct settlement history */}
          {directProposals.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('disputes.settlement.title')} className="mb-0" />
              {directProposals.map((p) => (
                <div key={p.id} className="rounded-xl2 bg-canvas-100 hairline p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink-900">
                      {t(
                        p.proposed_by_party === 'merchant'
                          ? 'admin.disputes.responses.merchant'
                          : 'admin.disputes.responses.customer',
                      )}
                      {p.round != null && (
                        <span className="text-ink-400 font-normal">
                          {' · '}
                          {t('disputes.settlement.round', { current: p.round, total: 2 })}
                        </span>
                      )}
                    </span>
                    <StatusChip
                      size="sm"
                      tone={p.status === 'accepted' ? 'success' : p.status === 'rejected' ? 'neutral' : 'warn'}
                      dot={false}
                      label={t(`disputes.settlement.status.${p.status}`)}
                    />
                  </div>
                  <div className="text-[15px] font-bold text-ink-900 num">
                    {formatCurrency(Number(p.amount))}
                  </div>
                  {p.note && <p className="text-[12px] text-ink-600 leading-relaxed">{p.note}</p>}
                  <div className="text-[11px] text-ink-400 num">{formatDate(p.created_at)}</div>
                </div>
              ))}
            </Card>
          )}

          {/* Lend mediation */}
          {(kase.dispute_phase === 'lend_mediation' || lendProposal) && (
            <LendMediationCard
              t={t}
              kase={kase}
              lendProposal={lendProposal}
              busy={busy}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              onSubmit={(amount, note) =>
                runAction('lend_submit_mediation_proposal', async () => {
                  await lendSubmitMediationProposal(kase.id, amount, note || undefined);
                })
              }
            />
          )}

          {/* terminal */}
          {kase.dispute_phase === 'resolved' && (
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'h-11 w-11 shrink-0 rounded-2xl grid place-items-center ring-1',
                    adminPhaseTone(kase) === 'success'
                      ? 'bg-success-50 text-success-600 ring-success-500/20'
                      : 'bg-canvas-100 text-ink-500 ring-canvas-200',
                  )}
                >
                  {adminPhaseTone(kase) === 'success' ? (
                    <BadgeCheckIcon size={20} />
                  ) : (
                    <InfoIcon size={20} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-ink-900">
                    {t(adminPhaseLabelKey(kase))}
                  </div>
                  {kase.dispute_outcome === 'unresolved' && (
                    <p className="mt-1 text-[12.5px] text-ink-600 leading-relaxed">
                      {t('admin.disputes.unresolvedNote')}
                    </p>
                  )}
                  {kase.agreed_amount != null && (
                    <p className="mt-1 text-[12.5px] text-ink-600 num">
                      {t('disputes.resolved.agreedAmount')} ·{' '}
                      {formatCurrency(Number(kase.agreed_amount))}
                    </p>
                  )}
                  {kase.resolved_at && (
                    <p className="mt-0.5 text-[11.5px] text-ink-400 num">
                      {formatDate(kase.resolved_at)}
                    </p>
                  )}
                </div>
              </div>
              {kase.dispute_outcome === 'unresolved' && (
                <Button
                  size="lg"
                  block
                  loading={busy}
                  disabled={busy}
                  onClick={() =>
                    runAction('export_dispute_file', async () => {
                      await exportDisputeFilePdf({
                        caseId: kase.id,
                        dir: locale === 'ar' ? 'rtl' : 'ltr',
                        locale,
                        t,
                        formatCurrency,
                        formatDate,
                      });
                    })
                  }
                >
                  {t('disputeFile.cta')}
                </Button>
              )}
            </Card>
          )}

          {/* administrative closure — neutral, non-judgmental */}
          {kase.dispute_phase !== 'resolved' && (
            <DismissCard
              t={t}
              busy={busy}
              onDismiss={(reason) =>
                runAction('admin_dismiss_dispute_case', () =>
                  adminDismissDisputeCase(kase.id, reason),
                )
              }
            />
          )}

          {/* persisted event history */}
          {events.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('merchant.disputes.events.title')} className="mb-0" />
              <div className="space-y-2.5">
                {events.map((e) => (
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

// ---------------------------------------------------------------------

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
}: {
  title: ReactNode;
  items: DisputeEvidenceItem[];
  emptyLabel: ReactNode;
}) {
  const urls = items.map((e) => e.url).filter((u): u is string => Boolean(u));
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
      {urls.length === 0 ? (
        <div className="rounded-xl2 bg-canvas-100 hairline p-3 flex items-center gap-2.5 text-[12px] text-ink-500">
          <ImageIcon size={15} className="shrink-0 text-ink-400" />
          {emptyLabel}
        </div>
      ) : (
        <PhotoGrid urls={urls} />
      )}
    </Card>
  );
}

/** Lend mediation: the single proposal form (when none exists yet) or
 *  the proposal + independent per-party response tracking. Admin has
 *  NO override on either response and no other lifecycle action. */
function LendMediationCard({
  t,
  kase,
  lendProposal,
  busy,
  formatCurrency,
  formatDate,
  onSubmit,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  kase: DamageCaseRow;
  lendProposal: DisputeProposalWithResponses | null;
  busy: boolean;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  onSubmit: (amount: number, note: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const amountValue = Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue >= 0 && amount.trim() !== '';

  const responseFor = (party: 'merchant' | 'customer') =>
    lendProposal?.dispute_proposal_responses.find((r) => r.party === party) ?? null;

  const partyRow = (party: 'merchant' | 'customer') => {
    const r = responseFor(party);
    const tone: StatusTone = !r ? 'warn' : r.accepted ? 'success' : 'neutral';
    return (
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-ink-700 font-semibold">
          {t(`admin.disputes.responses.${party}`)}
        </span>
        <span className="flex items-center gap-2">
          {r && <span className="text-[11px] text-ink-400 num">{formatDate(r.created_at)}</span>}
          <StatusChip
            size="sm"
            tone={tone}
            dot={false}
            label={t(
              `admin.disputes.responses.${!r ? 'pending' : r.accepted ? 'accepted' : 'rejected'}`,
            )}
          />
        </span>
      </div>
    );
  };

  return (
    <Card padded className="space-y-3.5">
      <SectionHeader title={t('admin.disputes.mediation.title')} className="mb-0" />
      <div className="rounded-xl2 bg-lavender-50 ring-1 ring-lavender-200 px-3.5 py-2.5 text-[12px] text-lavender-800 leading-relaxed flex items-start gap-2">
        <InfoIcon size={14} className="shrink-0 mt-0.5" />
        {t('admin.disputes.mediation.neutralNotice')}
      </div>

      {!lendProposal && kase.dispute_phase === 'lend_mediation' && (
        <div className="space-y-3">
          <FormField label={t('admin.disputes.mediation.amountLabel')} required>
            <Input
              inputMode="decimal"
              dir="ltr"
              className="num text-left"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </FormField>
          <FormField label={t('admin.disputes.mediation.noteLabel')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </FormField>
          <Button
            size="lg"
            block
            loading={busy}
            disabled={busy || !amountValid}
            onClick={() => setConfirmOpen(true)}
          >
            {t('admin.disputes.mediation.submit')}
          </Button>
          <ConfirmSheet
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              onSubmit(amountValue, note.trim());
            }}
            title={t('admin.disputes.mediation.confirmTitle')}
            description={t('admin.disputes.mediation.confirmBody')}
            confirmLabel={t('admin.disputes.mediation.confirm')}
            cancelLabel={t('admin.disputes.mediation.cancel')}
            icon={<GavelIcon size={18} />}
            tone="success"
          />
        </div>
      )}

      {lendProposal && (
        <div className="space-y-3">
          <div className="rounded-xl2 bg-canvas-100 hairline p-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold text-ink-900">
                {t('admin.disputes.mediation.submitted')}
              </span>
              <span className="text-[11px] text-ink-400 num">
                {formatDate(lendProposal.created_at)}
              </span>
            </div>
            <div className="text-[16px] font-bold text-ink-900 num">
              {formatCurrency(Number(lendProposal.amount))}
            </div>
            {lendProposal.note && (
              <p className="text-[12px] text-ink-600 leading-relaxed">{lendProposal.note}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-[12px] font-semibold text-ink-500">
              {t('admin.disputes.responses.title')}
            </div>
            {partyRow('merchant')}
            {partyRow('customer')}
            {kase.dispute_phase === 'lend_mediation' && (
              <p className="text-[11.5px] text-ink-400 leading-relaxed flex items-start gap-1.5">
                <ClockIcon size={12} className="shrink-0 mt-0.5" />
                {t('admin.disputes.responses.oneNotEnough')}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}


/** "إغلاق الحالة إداريًا" — admin-only neutral closure with a
 *  MANDATORY reason that is visible to both parties (it is stored in
 *  resolution_notes, which case-party RLS can read — the copy says
 *  so explicitly). Never implies fault, never touches the contract or
 *  eligibility; the rental continues its normal lifecycle. */
function DismissCard({
  t,
  busy,
  onDismiss,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  busy: boolean;
  onDismiss: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const valid = reason.trim().length > 0;
  return (
    <Card padded className="space-y-3">
      <SectionHeader title={t('admin.disputes.dismiss.cta')} className="mb-0" />
      <p className="text-[12px] text-ink-500 leading-relaxed">
        {t('admin.disputes.dismiss.confirmBody')}
      </p>
      <FormField label={t('admin.disputes.dismiss.reasonLabel')} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </FormField>
      <button
        type="button"
        disabled={busy || !valid}
        onClick={() => setOpen(true)}
        className="flex items-center justify-center h-12 w-full rounded-xl2 bg-white text-ink-800 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-canvas-300 hover:bg-canvas-50 transition-colors disabled:opacity-60"
      >
        {t('admin.disputes.dismiss.cta')}
      </button>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onDismiss(reason.trim());
        }}
        title={t('admin.disputes.dismiss.confirmTitle')}
        description={t('admin.disputes.dismiss.confirmBody')}
        confirmLabel={t('admin.disputes.dismiss.confirm')}
        cancelLabel={t('admin.disputes.dismiss.cancel')}
        icon={<InfoIcon size={18} />}
        tone="warn"
      />
    </Card>
  );
}
