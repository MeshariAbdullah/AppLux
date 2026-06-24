import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardSkeleton, EmptyState, PageSkeleton } from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  InfoIcon,
  ReceiptIcon,
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptInvoice,
  fetchInvoiceById,
  fetchMerchant,
  getSupabase,
  listInvoiceItems,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, Invoice } from '@/lib/data';
import { InvoiceStatusChip } from '@/components/rental/StatusChips';
import {
  CustomerContinuationStrip,
  type ContinuationStep,
} from '@/components/rental/CustomerContinuationStrip';
import {
  DocTimeline,
  type TimelineEvent,
} from '@/components/track/DocTimeline';
import { PlatformBadge } from '@/components/track/PlatformBadge';

// Map an invoice's status (and any linked contract state) to the
// customer's current step in the 5-step continuation strip.
function deriveContinuationStep(
  invoice: Invoice,
  contract: Contract | null | undefined,
): ContinuationStep {
  if (contract) {
    if (contract.status === 'active') return 'activation';
    return 'nafath';
  }
  if (invoice.status === 'paid') return 'nafath';
  return 'review';
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default function InvoiceTracking() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, contracts } = useStore();
  const { configured } = useSupabaseAuth();
  const { formatCurrency, formatDate } = useI18n();

  const demoInvoice = useMemo(() => invoices.find((i) => i.id === id), [invoices, id]);
  const { locale } = useI18n();

  const [liveInvoice, setLiveInvoice] = useState<Invoice | null>(null);
  const [liveContract, setLiveContract] = useState<Contract | null>(null);
  const [resolving, setResolving] = useState<boolean>(
    () => configured && Boolean(id),
  );

  useEffect(() => {
    if (!configured || !id) {
      setLiveInvoice(null);
      setLiveContract(null);
      setResolving(false);
      return;
    }
    // Clear any previous-entity state before fetching the new :id.
    setLiveInvoice(null);
    setLiveContract(null);
    setResolving(true);
    let cancelled = false;
    (async () => {
      const row = await fetchInvoiceById(id).catch(() => null);
      if (cancelled) return;
      if (!row) {
        setResolving(false);
        return;
      }
      const [items, merchant] = await Promise.all([
        listInvoiceItems(row.id).catch(() => []),
        fetchMerchant(row.merchant_id).catch(() => null),
      ]);
      if (cancelled) return;
      const merchantName = merchant
        ? (locale === 'ar' ? merchant.display_name?.ar : merchant.display_name?.en) ||
          merchant.display_name?.ar ||
          merchant.display_name?.en ||
          merchant.company_name
        : undefined;
      setLiveInvoice(adaptInvoice(row, items, merchantName));

      // Find the linked contract via invoice_id
      const sb = getSupabase();
      if (!sb) return;
      const { data: contractRow } = await sb
        .from('rental_contracts')
        .select('*')
        .eq('invoice_id', row.id)
        .maybeSingle();
      if (cancelled) return;
      if (contractRow) {
        setLiveContract(adaptContract(contractRow, merchantName));
      }
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, id, locale]);

  const invoice = liveInvoice ?? demoInvoice;
  const contract =
    liveContract ??
    (invoice ? contracts.find((c) => c.id === (invoice as Invoice).contractRef) : undefined);

  if (!invoice && resolving) {
    return (
      <>
        <Header title={t('track.invoiceTitle')} showBack />
        <Screen>
          <CardSkeleton />
          <div className="mt-4">
            <PageSkeleton rows={2} />
          </div>
        </Screen>
      </>
    );
  }

  if (!invoice) {
    return (
      <>
        <Header title={t('track.invoiceTitle')} showBack />
        <Screen>
          <EmptyState
            icon={<InfoIcon size={22} />}
            title={t('track.notFound')}
            action={
              <Button size="sm" onClick={() => navigate('/home', { replace: true })}>
                {t('track.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const events = buildInvoiceEvents(invoice, t);
  const merchantName = invoice.counterparty || contract?.counterparty || '';
  const continuationStep = deriveContinuationStep(invoice, contract);

  return (
    <>
      <Header title={t('track.invoiceTitle')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* ====== FOCUSED HERO ======
              Task-first: who you're renting from + what you're renting,
              right at the top. Status + amount + due date sit beneath. */}
          <div className="rounded-xl3 bg-white hairline shadow-soft p-5 animate-fade-in">
            {merchantName && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-lavender-700">
                {t('home.attention.fromMerchant', { merchant: merchantName })}
              </div>
            )}
            <div className="mt-1 editorial-title text-[20px] text-ink-900 leading-snug tracking-tight">
              {invoice.title}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <InvoiceStatusChip status={invoice.status} />
              <span className="text-[11.5px] text-ink-400 num">
                {invoice.contractRef}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('track.invoice.amountDue')}
                </div>
                <div className="mt-0.5 num text-[18px] font-semibold text-ink-900 leading-none">
                  {formatCurrency(invoice.amount)}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('track.invoice.dueOn')}
                </div>
                <div className="mt-0.5 num text-[14px] font-semibold text-ink-900 leading-none">
                  {formatDate(invoice.dueDate)}
                </div>
              </div>
            </div>
            {/* Pre-approval CTA — only when the invoice is still
                'due' (i.e. the customer hasn't accepted yet) AND we
                have a scan token to route into the review wizard.
                The wizard is where the customer actually reviews the
                contract clauses and approves. Once accepted, payment
                + Nafath simulation lives on the Approval screen, so
                this page intentionally has no primary CTA in the
                'paid' (= accepted) or 'overdue' state. */}
            {invoice.status === 'due' && invoice.scanToken && (
              <Button
                variant="primary"
                size="lg"
                block
                className="mt-5"
                leading={<SparkleIcon size={18} />}
                onClick={() => navigate(`/review/${invoice.scanToken}`)}
              >
                {t('track.invoice.reviewAndAccept')}
              </Button>
            )}
          </div>

          {/* ====== STATE BANNERS ====== */}
          {invoice.status === 'overdue' && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/20 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-danger-600">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{t('track.invoice.overdueBanner')}</span>
            </div>
          )}
          {invoice.status === 'paid' && (
            <div className="rounded-xl2 bg-success-50 ring-1 ring-success-500/20 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-success-600">
              <CheckIcon size={16} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{t('track.invoice.paidBanner')}</span>
            </div>
          )}

          {/* ====== 5-STEP CONTINUATION STRIP ======
              Replaces the 7-stage RentalJourneyTimeline at this surface.
              Customer-pre-payment view doesn't need the full system-
              of-record granularity. */}
          <CustomerContinuationStrip currentStep={continuationStep} />

          {/* ====== LINKED CONTRACT (small card, only when present) ====== */}
          {contract && (
            <button
              type="button"
              onClick={() => navigate(`/track/contract/${contract.id}`)}
              className="w-full text-start"
            >
              <Card padded interactive className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                  <DocIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                    {t('track.linkedContract')}
                  </div>
                  <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 truncate">
                    {contract.title}
                  </div>
                </div>
                <ArrowIcon size={14} className="shrink-0 text-ink-300 rtl:rotate-180" />
              </Card>
            </button>
          )}

          {/* ====== ACTIVITY (demoted — secondary, quieter) ======
              No SectionHeader heading-weight. Single muted card with
              a tiny label inside; the activity is supportive context,
              not the main action. */}
          <div className="rounded-xl2 bg-canvas-100/60 hairline px-4 pt-3.5 pb-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              {t('track.activity')}
            </div>
            <div className="mt-2">
              <DocTimeline events={events} />
            </div>
          </div>

          {/* ====== EXECUTION ESCALATION (only when overdue) ====== */}
          {invoice.status === 'overdue' && (
            <PlatformBadge
              platform="execution"
              state="escalated"
              title={t('track.placeholders.execution')}
              description={t('track.placeholders.executionDesc')}
              stateLabel={t('track.placeholders.escalated')}
            />
          )}

        </div>
      </Screen>
    </>
  );
}

function buildInvoiceEvents(
  invoice: { issuedAt: string; dueDate: string; status: 'due' | 'overdue' | 'paid' },
  t: (key: string, vars?: Record<string, string | number>) => string,
): TimelineEvent[] {
  const issued = invoice.issuedAt;
  const sent = addDays(issued, 1);
  const reminder = addDays(invoice.dueDate, -3);
  const due = invoice.dueDate;
  const overdueAt = addDays(invoice.dueDate, 3);
  const paidAt = addDays(invoice.dueDate, -1);

  if (invoice.status === 'paid') {
    return [
      evt('issued', t('track.invoice.events.issued'), issued, 'done', 'brand', <ReceiptIcon size={15} />),
      evt('sent', t('track.invoice.events.sent'), sent, 'done', 'brand', <ArrowIcon size={14} />),
      evt('paid', t('track.invoice.events.paid'), paidAt, 'current', 'success', <CheckIcon size={15} strokeWidth={2.6} />),
    ];
  }

  if (invoice.status === 'overdue') {
    return [
      evt('issued', t('track.invoice.events.issued'), issued, 'done', 'brand', <ReceiptIcon size={15} />),
      evt('sent', t('track.invoice.events.sent'), sent, 'done', 'brand', <ArrowIcon size={14} />),
      evt('reminder', t('track.invoice.events.reminder'), reminder, 'done', 'warn', <ClockIcon size={14} />),
      evt('due', t('track.invoice.events.due'), due, 'done', 'warn', <ClockIcon size={14} />),
      evt('overdue', t('track.invoice.events.overdue'), overdueAt, 'current', 'danger', <AlertIcon size={15} />),
      evt('escalated', t('track.invoice.events.escalated'), null, 'pending', 'danger', <ClockIcon size={14} />),
    ];
  }

  // Default pre-due branch.
  //
  // Previous bug: this branch marked "reminder" as the CURRENT event,
  // so a freshly issued invoice showed "Payment reminder sent" as the
  // current state — wrong: the customer hasn't even reviewed it yet.
  // The reminder event belongs only on the overdue path.
  return [
    evt('issued', t('track.invoice.events.issued'), issued, 'done', 'brand', <ReceiptIcon size={15} />),
    evt('sent', t('track.invoice.events.sent'), sent, 'done', 'brand', <ArrowIcon size={14} />),
    evt('awaiting-review', t('track.invoice.events.awaitingReview'), null, 'current', 'warn', <ClockIcon size={14} />),
    evt('due', t('track.invoice.events.due'), due, 'pending', 'neutral', <ClockIcon size={14} />),
    evt('paid', t('track.invoice.events.paid'), null, 'pending', 'success', <CheckIcon size={14} />),
  ];
}

function evt(
  id: string,
  label: string,
  at: string | null,
  state: TimelineEvent['state'],
  tone: TimelineEvent['tone'],
  icon: TimelineEvent['icon'],
): TimelineEvent {
  return { id, label, at, state, tone, icon };
}

