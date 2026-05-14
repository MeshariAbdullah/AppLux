import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  EmptyState,
  SectionHeader,
} from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  InfoIcon,
  ReceiptIcon,
  SparkleIcon,
  SupportIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptInvoice,
  fetchInvoiceById,
  getSupabase,
  listInvoiceItems,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, Invoice } from '@/lib/data';
import { InvoiceStatusChip } from '@/components/rental/StatusChips';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import {
  deriveJourneyFromUIContract,
  RENTAL_STAGES,
  type JourneyStep,
} from '@/lib/rentalJourney';
import {
  DocTimeline,
  type TimelineEvent,
} from '@/components/track/DocTimeline';
import { PlatformBadge } from '@/components/track/PlatformBadge';

function buildInvoiceJourney(
  invoice: Invoice | undefined,
  contract: Contract | null | undefined,
): JourneyStep[] {
  if (contract) {
    return deriveJourneyFromUIContract(
      contract,
      invoice ? { issuedAt: invoice.issuedAt } : null,
    );
  }
  return RENTAL_STAGES.map((stage): JourneyStep => {
    if (stage === 'request')
      return { stage, status: 'completed', at: invoice?.issuedAt ?? null };
    if (stage === 'review')
      return {
        stage,
        status: invoice?.status === 'paid' ? 'completed' : 'active',
        at: null,
      };
    return { stage, status: 'pending', at: null };
  });
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

  const [liveInvoice, setLiveInvoice] = useState<Invoice | null>(null);
  const [liveContract, setLiveContract] = useState<Contract | null>(null);

  useEffect(() => {
    if (!configured || !id) {
      setLiveInvoice(null);
      setLiveContract(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const row = await fetchInvoiceById(id).catch(() => null);
      if (cancelled || !row) return;
      const items = await listInvoiceItems(row.id).catch(() => []);
      if (cancelled) return;
      setLiveInvoice(adaptInvoice(row, items));

      // Find the linked contract via invoice_id
      const sb = getSupabase();
      if (!sb) return;
      const { data: contractRow } = await sb
        .from('rental_contracts')
        .select('*')
        .eq('invoice_id', row.id)
        .maybeSingle();
      if (cancelled || !contractRow) return;
      setLiveContract(adaptContract(contractRow));
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, id]);

  const invoice = liveInvoice ?? demoInvoice;
  const contract =
    liveContract ??
    (invoice ? contracts.find((c) => c.id === (invoice as Invoice).contractRef) : undefined);

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

  return (
    <>
      <Header title={t('track.invoiceTitle')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero — soft tinted */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-canvas-50 via-white to-gold-50 hairline p-6 shadow-card">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-15%] h-44 w-44 rounded-full bg-gold-300/18 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span className="h-11 w-11 rounded-xl bg-white text-ink-700 hairline grid place-items-center shrink-0">
                <ReceiptIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('track.invoice.amountDue')}
                </div>
                <div className="mt-1 editorial-title text-[28px] font-bold num leading-none text-ink-900">
                  {formatCurrency(invoice.amount)}
                </div>
                <div className="mt-1.5 text-[12px] text-ink-500 truncate">{invoice.title}</div>
              </div>
              <InvoiceStatusChip status={invoice.status} />
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.invoice.dueOn')}
                </div>
                <div className="mt-0.5 font-semibold num text-ink-900">{formatDate(invoice.dueDate)}</div>
              </div>
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.invoice.contractRef')}
                </div>
                <div className="mt-0.5 font-semibold num truncate text-ink-900">{invoice.contractRef}</div>
              </div>
            </div>
          </div>

          <RentalJourneyTimeline
            variant="lead"
            steps={buildInvoiceJourney(invoice, contract)}
          />

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

          {/* Summary */}
          <section>
            <SectionHeader title={t('track.summary')} />
            <Card padded className="space-y-3">
              <Field
                label={t('track.invoice.issuedOn')}
                value={<span className="num">{formatDate(invoice.issuedAt)}</span>}
              />
              <CardDivider />
              <Field
                label={t('track.invoice.dueOn')}
                value={<span className="num">{formatDate(invoice.dueDate)}</span>}
              />
              <CardDivider />
              <Field
                label={t('track.invoice.amountDue')}
                value={<span className="num">{formatCurrency(invoice.amount)}</span>}
              />
            </Card>
          </section>

          {/* Linked contract */}
          {contract && (
            <section>
              <SectionHeader title={t('track.linkedContract')} />
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
                    <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                      {contract.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-400 truncate">
                      {contract.counterparty}
                    </div>
                  </div>
                  <span className="num text-[11.5px] text-ink-400 shrink-0">{contract.id}</span>
                </Card>
              </button>
            </section>
          )}

          {/* Timeline */}
          <section>
            <SectionHeader title={t('track.activity')} />
            <Card padded>
              <DocTimeline events={events} />
            </Card>
          </section>

          {/* Execution escalation placeholder (only when overdue) */}
          {invoice.status === 'overdue' && (
            <PlatformBadge
              platform="execution"
              state="escalated"
              title={t('track.placeholders.execution')}
              description={t('track.placeholders.executionDesc')}
              stateLabel={t('track.placeholders.escalated')}
            />
          )}

          {/* Actions */}
          <div className="space-y-2.5">
            {invoice.status !== 'paid' && (
              <Button
                variant="primary"
                size="lg"
                block
                leading={<SparkleIcon size={18} />}
              >
                {t('track.invoice.payNow')}
              </Button>
            )}
            <Button variant="secondary" block leading={<SupportIcon size={16} />}>
              {t('track.contactSupport')}
            </Button>
          </div>
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

  return [
    evt('issued', t('track.invoice.events.issued'), issued, 'done', 'brand', <ReceiptIcon size={15} />),
    evt('sent', t('track.invoice.events.sent'), sent, 'done', 'brand', <ArrowIcon size={14} />),
    evt('reminder', t('track.invoice.events.reminder'), reminder, 'current', 'warn', <ClockIcon size={14} />),
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

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">{value}</div>
    </div>
  );
}
