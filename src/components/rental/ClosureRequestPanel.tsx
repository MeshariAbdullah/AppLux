// =====================================================================
// Package 1 — closure-request lifecycle panel, shared by the customer
// contract-tracking page and the merchant rental-details page.
//
// Live (Supabase-configured) mode only: the parent mounts it when a
// live contract row exists. All writes go through the 20260502130600
// SECURITY DEFINER RPCs; nothing here mutates tables directly.
// =====================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, ConfirmSheet, FormField, Sheet, StatusChip, Textarea } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { logEvent } from '@/lib/observability/log';
import {
  confirmContractClosure,
  fetchContractById,
  fetchLiveClosureRequest,
  listContractEvents,
  objectContractClosure,
  requestContractClosure,
  useSupabaseAuth,
  type ClosureRequestRow,
  type ContractEventRow,
} from '@/lib/supabase';

type Props = {
  role: 'customer' | 'merchant';
  contractId: string;
  /** Parent refetch hook — called after any successful transition. */
  onChanged?: () => void;
};

export function ClosureRequestPanel({ role, contractId, onChanged }: Props) {
  const { t, formatDate } = useI18n();
  const formatAt = (iso: string | null | undefined) =>
    iso ? formatDate(iso, { dateStyle: 'short', timeStyle: 'short' }) : '';
  const { session } = useSupabaseAuth();
  const uid = session?.user?.id ?? null;

  const [request, setRequest] = useState<ClosureRequestRow | null>(null);
  const [events, setEvents] = useState<ContractEventRow[]>([]);
  const [contractStatus, setContractStatus] = useState<string>('');
  const [closureReason, setClosureReason] = useState<string | null>(null);
  const [closureVia, setClosureVia] = useState<string | null>(null);
  const [closureNote, setClosureNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nonHandoverOpen, setNonHandoverOpen] = useState(false);
  const [declareOpen, setDeclareOpen] = useState(false);
  const [declareNote, setDeclareNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [objectOpen, setObjectOpen] = useState(false);
  const [objectReason, setObjectReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [row, req, evts] = await Promise.all([
        fetchContractById(contractId),
        fetchLiveClosureRequest(contractId),
        listContractEvents(contractId),
      ]);
      setContractStatus(row?.status ?? '');
      setClosureReason(row?.closure_reason ?? null);
      setClosureVia(row?.closure_via ?? null);
      setClosureNote(row?.closure_note ?? null);
      setRequest(req);
      setEvents(evts);
      setError(null);
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'closure_panel_load' }, err);
      setError(t('closure.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [contractId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, op: string) => {
      setActing(true);
      setError(null);
      try {
        await fn();
        await load();
        onChanged?.();
        return true;
      } catch (err) {
        logEvent('rpc_failure', 'warn', { op }, err);
        setError(t('closure.errors.action'));
        return false;
      } finally {
        setActing(false);
      }
    },
    [load, onChanged, t],
  );

  const isRequester = request != null && uid != null && request.requested_by === uid;
  const timeline = useMemo(() => events.slice(-6).reverse(), [events]);

  const showNonHandoverCta =
    !loading && request == null && contractStatus === 'pending';
  const showDeclareCta =
    !loading && request == null && contractStatus === 'active' && role === 'customer';

  if (
    loading ||
    (!request &&
      !showNonHandoverCta &&
      !showDeclareCta &&
      contractStatus !== 'ended' &&
      timeline.length === 0)
  ) {
    return null;
  }

  return (
    <Card padded className="space-y-4" data-testid="closure-panel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-bold text-ink-900">{t('closure.title')}</h3>
        {contractStatus === 'ended' && closureReason && (
          <StatusChip
            tone={closureReason === 'returned' ? 'success' : 'warn'}
            dot
            label={t(`closure.reason.${closureReason}`)}
          />
        )}
      </div>

      {error && (
        <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/20 px-3.5 py-2.5 text-[12.5px] text-danger-700">
          {error}
        </div>
      )}

      {/* Closed summary */}
      {contractStatus === 'ended' && closureReason && (
        <div className="space-y-1 text-[12.5px] text-ink-600">
          {closureVia && <div>{t(`closure.via.${closureVia}`)}</div>}
          {closureNote && <div className="text-ink-500">{closureNote}</div>}
        </div>
      )}

      {/* Entry actions */}
      {showNonHandoverCta && (
        <div className="space-y-2">
          <p className="text-[12.5px] text-ink-600 leading-relaxed">
            {t('closure.nonHandover.hint')}
          </p>
          <Button variant="secondary" block onClick={() => setNonHandoverOpen(true)} disabled={acting}>
            {t('closure.nonHandover.cta')}
          </Button>
        </div>
      )}
      {showDeclareCta && (
        <div className="space-y-2">
          <p className="text-[12.5px] text-ink-600 leading-relaxed">
            {t('closure.declareReturn.hint')}
          </p>
          <Button variant="secondary" block onClick={() => setDeclareOpen(true)} disabled={acting}>
            {t('closure.declareReturn.cta')}
          </Button>
        </div>
      )}

      {/* Live request */}
      {request && (
        <div className="space-y-3">
          <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-3.5 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold text-ink-900">
                {t(`closure.kind.${request.kind}`)}
              </span>
              <StatusChip
                tone={request.status === 'admin_review' ? 'warn' : 'brand'}
                dot
                label={t(`closure.status.${request.status}`)}
              />
            </div>
            <div className="text-[11.5px] text-ink-500 num">
              {formatAt(request.created_at)}
            </div>
            {request.request_note && (
              <div className="text-[12px] text-ink-600">{request.request_note}</div>
            )}
            {request.kind === 'return_declared' && request.status === 'open' && (
              <div className="text-[12px] text-ink-600">
                {request.deadline_at
                  ? t('closure.deadlineAt', { at: formatAt(request.deadline_at) })
                  : t('closure.awaitingDelivery')}
              </div>
            )}
            {request.status === 'admin_review' && (
              <div className="text-[12px] text-warn-700">{t('closure.adminReviewHint')}</div>
            )}
          </div>

          {request.status === 'open' && isRequester && (
            <p className="text-[12.5px] text-ink-500">{t('closure.waitingCounterparty')}</p>
          )}

          {request.status === 'open' && !isRequester && (
            <div className="flex gap-2">
              <Button
                block
                loading={acting}
                onClick={() => setConfirmOpen(true)}
              >
                {t(`closure.confirm.${request.kind}.cta`)}
              </Button>
              <Button
                variant="secondary"
                block
                disabled={acting}
                onClick={() => setObjectOpen(true)}
              >
                {t('closure.object.cta')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Compact audit timeline */}
      {timeline.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-ink-400 uppercase tracking-[0.08em]">
            {t('closure.events.title')}
          </div>
          <ul className="space-y-1">
            {timeline.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="text-ink-600 truncate">
                  {t(`closure.events.${e.event}`)}
                </span>
                <span className="text-ink-400 num shrink-0">{formatAt(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dialogs */}
      <ConfirmSheet
        open={nonHandoverOpen}
        onClose={() => setNonHandoverOpen(false)}
        loading={acting}
        tone="danger"
        title={t('closure.nonHandover.confirmTitle')}
        description={t('closure.nonHandover.confirmBody')}
        confirmLabel={t('closure.nonHandover.confirmCta')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          const ok = await act(
            () => requestContractClosure({ contractId, kind: 'non_handover' }),
            'request_contract_closure',
          );
          if (ok) setNonHandoverOpen(false);
        }}
      />

      <Sheet open={declareOpen} onClose={() => setDeclareOpen(false)} title={t('closure.declareReturn.sheetTitle')}>
        <div className="space-y-4 p-1">
          <p className="text-[12.5px] text-ink-600 leading-relaxed">
            {t('closure.declareReturn.sheetBody')}
          </p>
          <FormField label={t('closure.declareReturn.noteLabel')} hint={t('common.optional')}>
            <Textarea
              value={declareNote}
              onChange={(e) => setDeclareNote(e.target.value)}
              rows={3}
            />
          </FormField>
          <Button
            block
            loading={acting}
            onClick={async () => {
              const ok = await act(
                () =>
                  requestContractClosure({
                    contractId,
                    kind: 'return_declared',
                    note: declareNote.trim() || null,
                  }),
                'request_contract_closure',
              );
              if (ok) {
                setDeclareOpen(false);
                setDeclareNote('');
              }
            }}
          >
            {t('closure.declareReturn.submit')}
          </Button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        loading={acting}
        tone="brand"
        title={t(`closure.confirm.${request?.kind ?? 'non_handover'}.title`)}
        description={t(`closure.confirm.${request?.kind ?? 'non_handover'}.body`)}
        confirmLabel={t(`closure.confirm.${request?.kind ?? 'non_handover'}.cta`)}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          if (!request) return;
          const ok = await act(() => confirmContractClosure(request.id), 'confirm_contract_closure');
          if (ok) setConfirmOpen(false);
        }}
      />

      <Sheet open={objectOpen} onClose={() => setObjectOpen(false)} title={t('closure.object.title')}>
        <div className="space-y-4 p-1">
          <p className="text-[12.5px] text-ink-600 leading-relaxed">{t('closure.object.body')}</p>
          <FormField label={t('closure.object.reasonLabel')}>
            <Textarea
              value={objectReason}
              onChange={(e) => setObjectReason(e.target.value)}
              rows={3}
            />
          </FormField>
          <Button
            block
            variant="danger"
            loading={acting}
            disabled={objectReason.trim() === ''}
            onClick={async () => {
              if (!request) return;
              const ok = await act(
                () => objectContractClosure(request.id, objectReason.trim()),
                'object_contract_closure',
              );
              if (ok) {
                setObjectOpen(false);
                setObjectReason('');
              }
            }}
          >
            {t('closure.object.submit')}
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
