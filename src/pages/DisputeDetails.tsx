import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  CameraIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  ImageIcon,
  InfoIcon,
  ShieldIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { logEvent } from '@/lib/observability/log';
import { translateError, withSupportId } from '@/lib/errors';
import { useI18n, useT } from '@/lib/i18n';
import { prepareEvidenceImage, PrepareImageError } from '@/lib/image/prepareEvidenceImage';
import { useSensitiveFlow } from '@/lib/session/flowGuard';
import {
  customerAcceptClaim,
  customerObjectToClaim,
  fetchContractById,
  fetchDisputeCase,
  fetchMerchant,
  listContractReceiptPhotos,
  getReceiptPhotoUrl,
  listDisputeEvidence,
  listDisputeProposals,
  listInvoiceItems,
  respondToLendProposal,
  respondToSettlementProposal,
  submitSettlementProposal,
  uploadDamageEvidence,
  useSupabaseAuth,
  type DamageCaseRow,
  type DisputeEvidenceItem,
  type DisputeProposalWithResponses,
  type MerchantRow,
  type RentalContractRow,
} from '@/lib/supabase';

// =====================================================================
// DisputeDetails — /disputes/:id (customer side)
//
// Phase-1 dispute lifecycle over the 20260502124700 server foundation.
// The UI reflects ONLY canonical server state: dispute_phase for the
// flow position, dispute_outcome for the terminal result, and real
// proposal/response rows for the two direct rounds. Nothing is derived
// from timestamps and legacy `stage` is never read. All transitions
// call the deployed RPCs and then refetch.
//
// Tone: neutral and calm. A claim is documented, not proven; an
// objection is recorded, not a verdict. No court/Nafith/enforcement
// wording anywhere on this surface.
// =====================================================================

type ObjEvidence = { id: string; previewUrl: string; file: File };
const MAX_OBJ_EVIDENCE = 6;
let objSeq = 0;

type Bundle = {
  kase: DamageCaseRow;
  contract: RentalContractRow | null;
  merchant: MerchantRow | null;
  itemName: string | null;
  proposals: DisputeProposalWithResponses[];
  evidence: DisputeEvidenceItem[];
  receiptUrls: string[];
};

export default function DisputeDetails() {
  const t = useT();
  const { dir, formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { configured, session } = useSupabaseAuth();
  const uid = session?.user?.id ?? null;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [resolving, setResolving] = useState<boolean>(() => Boolean(configured && id));
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSensitiveFlow(busy);

  const load = useCallback(async () => {
    if (!configured || !id) return null;
    const kase = await fetchDisputeCase(id).catch(() => null);
    if (!kase) return null;
    const [contract, merchant, proposals, evidence] = await Promise.all([
      fetchContractById(kase.contract_id).catch(() => null),
      fetchMerchant(kase.merchant_id).catch(() => null),
      listDisputeProposals(kase.id).catch(() => []),
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
    return { kase, contract, merchant, itemName, proposals, evidence, receiptUrls };
  }, [configured, id]);

  const refetch = useCallback(async () => {
    const next = await load();
    setBundle(next);
    return next;
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

  // -------- action helpers: RPC → refetch → localized error ----------
  const runAction = async (op: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      // Concurrent state change (wrong phase / already handled): show
      // the latest canonical state alongside the message.
      if (code === 'P0201' || code === 'P0205' || code === 'P0208') {
        await refetch().catch(() => {});
      }
      const eventId = logEvent('dispute_action_failed', 'warn', { op }, err);
      setActionError(withSupportId(translateError(err, t), eventId));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- render: loading / not found ----------------------
  if (!bundle) {
    if (resolving) {
      return (
        <>
          <Header title={t('disputes.title')} showBack />
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
        <Header title={t('disputes.title')} showBack />
        <Screen className="bg-canvas">
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('disputes.notFound.title')}
            description={t('disputes.notFound.body')}
            action={
              <Button size="sm" onClick={() => navigate('/contracts', { replace: true })}>
                {t('disputes.notFound.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const { kase, contract, merchant, itemName, proposals, evidence, receiptUrls } = bundle;
  const merchantName =
    merchant?.display_name?.[locale] ?? merchant?.display_name?.ar ?? merchant?.company_name ?? '—';
  const merchantEvidence = evidence.filter((e) => e.row.uploaded_by_user_id !== kase.customer_user_id);
  const customerEvidence = evidence.filter((e) => e.row.uploaded_by_user_id === kase.customer_user_id);
  const directProposals = proposals.filter((p) => p.kind === 'direct');
  const lendProposal = proposals.find((p) => p.kind === 'lend') ?? null;
  const pendingDirect = directProposals.find((p) => p.status === 'pending') ?? null;
  const usedRounds = directProposals.length;

  const phaseTone: StatusTone =
    kase.dispute_phase === 'resolved'
      ? kase.dispute_outcome === 'unresolved'
        ? 'neutral'
        : 'success'
      : kase.dispute_phase === 'awaiting_customer'
        ? 'warn'
        : 'brand';

  return (
    <>
      <Header title={t('disputes.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          {/* ---------- neutral hero ---------- */}
          <Card padded className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-canvas-100 ring-1 ring-canvas-200 text-ink-700 grid place-items-center">
                <ShieldIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] text-ink-400 uppercase tracking-[0.08em]">
                  {t('disputes.eyebrow')}
                </div>
                <div className="mt-0.5 text-[16px] font-bold text-ink-900 num" dir="ltr">
                  {kase.case_number}
                </div>
              </div>
              <StatusChip tone={phaseTone} dot label={t(`disputes.phase.${kase.dispute_phase}`)} />
            </div>
            <p className="text-[12px] text-ink-500 leading-relaxed">
              {t('disputes.claim.neutralNote')}
            </p>
          </Card>

          {actionError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700">
              {actionError}
            </div>
          )}

          {/* ---------- claim facts ---------- */}
          <Card padded className="space-y-3">
            <SectionHeader title={t('disputes.claim.title')} className="mb-0" />
            <FactRow label={t('disputes.claim.type')} value={t(`disputes.claim.types.${kase.severity}`)} />
            <FactRow label={t('disputes.claim.merchant')} value={merchantName} />
            {contract && (
              <FactRow
                label={t('disputes.claim.contract')}
                value={<span className="num" dir="ltr">{contract.contract_number}</span>}
              />
            )}
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
                <div>
                  <div className="text-[11px] text-ink-400 uppercase tracking-wide mb-1">
                    {t('disputes.claim.description')}
                  </div>
                  <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                    {kase.description}
                  </p>
                </div>
              </>
            )}
            {contract && (
              <Link
                to={`/track/contract/${contract.id}`}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-lavender-700"
              >
                <DocIcon size={14} />
                {t('disputes.contractLink')}
              </Link>
            )}
          </Card>

          {/* ---------- evidence ---------- */}
          <EvidenceCard
            title={t('disputes.evidence.merchantTitle')}
            items={merchantEvidence}
            emptyLabel={t('disputes.evidence.none')}
            unavailableLabel={t('disputes.evidence.imageUnavailable')}
          />
          {receiptUrls.length > 0 && (
            <Card padded className="space-y-2.5">
              <SectionHeader title={t('disputes.evidence.receiptTitle')} className="mb-0" />
              <p className="text-[11.5px] text-ink-500">{t('disputes.evidence.receiptHint')}</p>
              <PhotoGrid urls={receiptUrls} />
            </Card>
          )}
          {customerEvidence.length > 0 && (
            <EvidenceCard
              title={t('disputes.evidence.customerTitle')}
              items={customerEvidence}
              emptyLabel={t('disputes.evidence.none')}
              unavailableLabel={t('disputes.evidence.imageUnavailable')}
            />
          )}

          {/* ---------- objection reason (once recorded) ---------- */}
          {kase.customer_objection_reason && kase.dispute_phase !== 'awaiting_customer' && (
            <Card padded className="space-y-2">
              <SectionHeader title={t('disputes.settlement.yourObjection')} className="mb-0" />
              <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-line">
                {kase.customer_objection_reason}
              </p>
            </Card>
          )}

          {/* ---------- phase panels ---------- */}
          {kase.dispute_phase === 'awaiting_customer' && (
            <AwaitingPanel
              t={t}
              kase={kase}
              busy={busy}
              formatCurrency={formatCurrency}
              onAccept={() => runAction('customer_accept_claim', () => customerAcceptClaim(kase.id))}
              onObject={(reason, photos) =>
                runAction('customer_object_to_claim', async () => {
                  // Server-authoritative order: the objection RPC first
                  // (it moves the case to direct_settlement — which is
                  // exactly what authorizes the customer evidence
                  // INSERT policy), then best-effort evidence uploads.
                  await customerObjectToClaim(kase.id, reason);
                  let failures = 0;
                  for (const p of photos) {
                    try {
                      await uploadDamageEvidence({
                        caseId: kase.id,
                        file: p.file,
                        evidenceType: 'photo',
                        uploadedByUserId: uid ?? undefined,
                      });
                    } catch (err) {
                      failures += 1;
                      logEvent('rpc_failure', 'warn', { op: 'customer_evidence_upload' }, err);
                    }
                  }
                  if (failures > 0) {
                    setActionError(t('disputes.await.objectForm.uploadPartial'));
                  }
                })
              }
            />
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

          {/* Past proposals stay visible in every later phase. */}
          {kase.dispute_phase !== 'direct_settlement' && directProposals.length > 0 && (
            <ProposalHistory
              t={t}
              proposals={directProposals}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
            />
          )}
        </div>
      </Screen>
    </>
  );
}

// =====================================================================
// Sub-components
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
          {missing > 0 && (
            <div className="text-[11px] text-ink-400">{unavailableLabel}</div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// awaiting_customer — exactly two primary actions
// ---------------------------------------------------------------------

function AwaitingPanel({
  t,
  kase,
  busy,
  formatCurrency,
  onAccept,
  onObject,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  kase: DamageCaseRow;
  busy: boolean;
  formatCurrency: (n: number) => string;
  onAccept: () => void;
  onObject: (reason: string, photos: ObjEvidence[]) => void;
}) {
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [objectOpen, setObjectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [photos, setPhotos] = useState<ObjEvidence[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Free preview object URLs on unmount.
  const photosRef = useRef<ObjEvidence[]>(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [],
  );

  const onFiles = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (fileRef.current) fileRef.current.value = '';
    if (list.length === 0) return;
    setProcessing(true);
    const prepared: ObjEvidence[] = [];
    for (const f of list.slice(0, MAX_OBJ_EVIDENCE - photos.length)) {
      try {
        const p = await prepareEvidenceImage(f);
        // eslint-disable-next-line no-plusplus
        prepared.push({ id: `obj-${(objSeq += 1)}`, previewUrl: p.previewUrl, file: p.file });
      } catch (err) {
        logEvent('rpc_failure', 'warn', {
          op: 'objection_evidence_prepare',
          cause: err instanceof PrepareImageError ? err.kind : 'unknown',
        });
      }
    }
    if (prepared.length) setPhotos((prev) => [...prev, ...prepared].slice(0, MAX_OBJ_EVIDENCE));
    setProcessing(false);
  };

  const reasonValid = reason.trim().length > 0;

  return (
    <Card padded className="space-y-3.5">
      <SectionHeader title={t('disputes.await.title')} className="mb-0" />
      <p className="text-[12.5px] text-ink-500 leading-relaxed">{t('disputes.await.hint')}</p>

      {!objectOpen && (
        <div className="space-y-2.5">
          <Button size="lg" block disabled={busy} onClick={() => setAcceptOpen(true)}>
            {t('disputes.await.accept')}
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setObjectOpen(true)}
            className="flex items-center justify-center h-12 w-full rounded-xl2 bg-white text-ink-800 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-canvas-300 hover:bg-canvas-50 transition-colors"
          >
            {t('disputes.await.object')}
          </button>
        </div>
      )}

      {objectOpen && (
        <div className="space-y-3.5">
          <div className="text-[13.5px] font-semibold text-ink-900">
            {t('disputes.await.objectForm.title')}
          </div>
          <FormField
            label={t('disputes.await.objectForm.reasonLabel')}
            required
            error={
              reasonTouched && !reasonValid
                ? t('disputes.await.objectForm.reasonRequired')
                : undefined
            }
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setReasonTouched(true)}
              placeholder={t('disputes.await.objectForm.reasonPlaceholder')}
              rows={4}
              invalid={reasonTouched && !reasonValid}
            />
          </FormField>

          <div>
            <div className="text-[13px] font-semibold text-ink-800 mb-1.5">
              {t('disputes.await.objectForm.evidenceLabel')}
            </div>
            <p className="text-[11.5px] text-ink-400 mb-2">
              {t('disputes.await.objectForm.evidenceHint')}
            </p>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-canvas-200 hairline">
                    <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={t('disputes.await.objectForm.remove')}
                      onClick={() =>
                        setPhotos((prev) => {
                          URL.revokeObjectURL(prev[i].previewUrl);
                          return prev.filter((_, j) => j !== i);
                        })
                      }
                      className="absolute top-1 end-1 h-6 w-6 grid place-items-center rounded-full bg-black/60 text-white text-[13px]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < MAX_OBJ_EVIDENCE && (
              <button
                type="button"
                disabled={processing || busy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl2 bg-canvas-100 hairline text-[12.5px] font-semibold text-ink-700"
              >
                <CameraIcon size={15} />
                {t('disputes.await.objectForm.addPhoto')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void onFiles(e.target.files)}
            />
          </div>

          <Button
            size="lg"
            block
            loading={busy}
            disabled={busy || !reasonValid || processing}
            onClick={() => {
              setReasonTouched(true);
              if (reasonValid) onObject(reason.trim(), photos);
            }}
          >
            {t('disputes.await.objectForm.submit')}
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        onConfirm={() => {
          setAcceptOpen(false);
          onAccept();
        }}
        title={t('disputes.await.acceptSheet.title')}
        description={t('disputes.await.acceptSheet.body', {
          amount: formatCurrency(Number(kase.claim_amount)),
        })}
        confirmLabel={t('disputes.await.acceptSheet.confirm')}
        cancelLabel={t('disputes.await.acceptSheet.cancel')}
        icon={<BadgeCheckIcon size={18} />}
        tone="success"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------
// direct_settlement — exactly two rounds, server truth only
// ---------------------------------------------------------------------

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
          {t(`disputes.settlement.proposalFrom.${p.proposed_by_party}`)}
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

function ProposalHistory({
  t,
  proposals,
  formatCurrency,
  formatDate,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  proposals: DisputeProposalWithResponses[];
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
}) {
  return (
    <Card padded className="space-y-2.5">
      <SectionHeader title={t('disputes.settlement.title')} className="mb-0" />
      {proposals.map((p) => (
        <ProposalCard key={p.id} t={t} p={p} formatCurrency={formatCurrency} formatDate={formatDate} />
      ))}
    </Card>
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

  const pendingFromMerchant = pendingDirect?.proposed_by_party === 'merchant';
  const pendingFromMe = pendingDirect?.proposed_by_party === 'customer';
  // Server truth: rounds used = number of direct proposals. A new
  // proposal is possible only without a pending one and below 2.
  const canSubmit = !pendingDirect && usedRounds < 2;
  const currentRound = Math.min(usedRounds + (pendingDirect ? 0 : 1), 2);
  const amountValue = Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue >= 0 && amount.trim() !== '';

  return (
    <Card padded className="space-y-3.5">
      <SectionHeader title={t('disputes.settlement.title')} className="mb-0" />
      {/* The two-round rule, stated up front. */}
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

      {pendingFromMerchant && pendingDirect && (
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

// ---------------------------------------------------------------------
// lend_mediation — neutral assistance framing only
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// resolved — distinct terminal states, all neutral
// ---------------------------------------------------------------------

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
  // NULL outcome can only come from an out-of-band/legacy settle —
  // render it with the neutral unresolved-style framing.
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
            {t(`disputes.resolved.${outcome}.title`)}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-600 leading-relaxed">
            {t(`disputes.resolved.${outcome}.body`, { amount })}
          </p>
          {outcome === 'unresolved' && (
            <p className="mt-1.5 text-[12px] text-ink-500 leading-relaxed">
              {t('disputes.resolved.unresolved.neutral')}
            </p>
          )}
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
